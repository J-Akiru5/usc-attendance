// Live end-to-end test: payments, clearance and public verification (plan §8.5).
// Proves the last acceptance lines of the fines module — "payment clears;
// verification page confirms authenticity and tamper attempts fail" — end to
// end, including the public check with no session at all. Throwaway data.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { api } from './client.mts'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2epay' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], eventIds: string[], fineIds: string[], clearanceIds: string[] } = { userIds: [], eventIds: [], fineIds: [], clearanceIds: [] }

async function mkUser(key: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${key}@example.invalid`
  const password = randomBytes(12).toString('base64url') + 'aA1!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await prisma.user.create({
    data: { id: data.user.id, email, name: `E2E ${key}`, position: 'Test', role: 'client', mustChangePassword: false, active: true, ...extra }
  })
  const { data: s, error: se } = await anon().auth.signInWithPassword({ email, password })
  if (se || !s.session) throw se
  made.userIds.push(data.user.id)
  return { id: data.user.id, token: s.session.access_token }
}

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  // D-06: money is recorded by someone holding the finance capability — the
  // Treasurer in practice, here a super admin — and not by staff at large.
  const manager = await mkUser('manager', { role: 'super_admin', canConfigure: true })
  const student = await mkUser('student', { role: 'student' })
  const other = await mkUser('other', { role: 'student' })
  await prisma.studentProfile.create({ data: { userId: student.id, studentNo: `${tag.slice(-7)}1`, yearLevel: 2 } })

  const event = await prisma.event.create({
    data: { title: `${tag} assembly`, date: new Date(Date.now() - 172_800_000), lat: 10.72, lng: 122.56, createdBy: staff.id }
  })
  made.eventIds.push(event.id)

  // Two fines for the same student need two events: one fine per student per
  // event is the schema's own rule (the unique index), not a limitation here.
  const secondEvent = await prisma.event.create({
    data: { title: `${tag} assembly two`, date: new Date(Date.now() - 172_800_000), lat: 10.72, lng: 122.56, createdBy: staff.id }
  })
  made.eventIds.push(secondEvent.id)

  const fineA = await prisma.fine.create({ data: { userId: student.id, eventId: event.id, kind: 'absent', amountCentavos: 5000 } })
  const fineB = await prisma.fine.create({ data: { userId: student.id, eventId: secondEvent.id, kind: 'late', amountCentavos: 2500 } })
  made.fineIds.push(fineA.id, fineB.id)

  console.log('\n--- recording a payment ---')
  // D-06: recording money needs the finance capability, not merely being staff.
  let r = await api(`/api/fines/${fineA.id}/payment`, { method: 'POST', token: staff.token, body: { method: 'cash', reference: 'OR-BEFORE-TREASURER' } })
  check('a plain staff member cannot record a payment (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/fines/${fineA.id}/payment`, { method: 'POST', token: student.token, body: { method: 'cash', reference: 'OR-1' } })
  check('a student cannot record their own payment (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/fines/${fineA.id}/payment`, { method: 'POST', token: manager.token, body: { method: 'cheque', reference: 'X-1' } })
  check('an invented method is refused (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/fines/${fineA.id}/payment`, { method: 'POST', token: manager.token, body: { method: 'cash', reference: '' } })
  check('a missing OR number is refused (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/fines/${fineA.id}/payment`, { method: 'POST', token: manager.token, body: { method: 'cash', reference: 'OR-2026-001', amountCentavos: 2500 } })
  check('a partial amount is refused (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/fines/${fineA.id}/payment`, { method: 'POST', token: manager.token, body: { method: 'cash', reference: 'OR-2026-001' } })
  check('the Treasurer records the payment (201)', r._s === 201 && r._b?.fine?.status === 'paid', `${r._s} ${JSON.stringify(r._b?.fine)}`)
  check('and the account still shows what is owed', r._b?.account?.unpaidPesos === '₱25.00' && r._b?.account?.cleared === false, JSON.stringify(r._b?.account))

  const paidFine = await prisma.fine.findUnique({ where: { id: fineA.id } })
  check('the fine carries the receipt reference', paidFine?.status === 'paid' && paidFine.paymentRef === 'OR-2026-001', `${paidFine?.status} ${paidFine?.paymentRef}`)

  r = await api(`/api/fines/${fineA.id}/payment`, { method: 'POST', token: manager.token, body: { method: 'cash', reference: 'OR-2026-002' } })
  check('paying twice is refused (409)', r._s === 409, `${r._s}`)

  const notified = await prisma.notification.findMany({ where: { userId: student.id, kind: 'payment_recorded' } })
  check('the student is told, with what is left', notified.length === 1 && /25\.00/.test(notified[0]!.body), `${notified.length} ${notified[0]?.body?.slice(0, 60)}`)

  console.log('\n--- the student sees their standing ---')
  r = await api('/api/clearance/mine', { token: student.token })
  check('not cleared while money is owed (200)', r._s === 200 && r._b?.state?.cleared === false && r._b?.state?.unpaidPesos === '₱25.00', `${r._s} ${JSON.stringify(r._b?.state)}`)

  r = await api('/api/clearance/issue', { method: 'POST', token: manager.token, body: { userId: student.id } })
  check('a certificate cannot be issued while money is owed (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/fines/${fineB.id}/payment`, { method: 'POST', token: manager.token, body: { method: 'gcash', reference: 'GC-8891234', note: 'Paid at the office' } })
  check('the last fine is settled (201)', r._s === 201 && r._b?.account?.cleared === true, `${r._s} ${JSON.stringify(r._b?.account)}`)

  console.log('\n--- issuing and verifying a clearance ---')
  r = await api('/api/clearance/issue', { method: 'POST', token: manager.token, body: { userId: student.id } })
  const clearance = r._b?.clearance
  if (r._s === 201) made.clearanceIds.push(clearance?.id)
  check('staff issue a certificate (201)', r._s === 201 && typeof clearance?.code === 'string' && clearance.code.length === 10, `${r._s} ${JSON.stringify(clearance?.code)}`)
  check('the code avoids confusing characters', !/[IO01]/.test(clearance?.code ?? 'IO01'), `${clearance?.code}`)

  r = await api(`/api/clearance/issue`, { method: 'POST', token: student.token, body: { userId: student.id } })
  check('a student cannot issue their own (403)', r._s === 403, `${r._s}`)

  // The PUBLIC check: no token at all.
  r = await api(`/api/verify/${clearance?.code}`)
  check('anyone can verify the code, no session needed (200)', r._s === 200 && r._b?.status === 'valid', `${r._s} ${JSON.stringify(r._b?.status)}`)
  check('it says when it was issued and by whom', !!r._b?.issuedAt && !!r._b?.issuer, `${r._b?.issuedAt} ${r._b?.issuer}`)
  // D-07: standing only — no name, no student number, no amount.
  check('and reveals nothing about the student', !('name' in (r._b ?? {})) && !('studentNo' in (r._b ?? {})) && !('coveredPesos' in (r._b ?? {})), JSON.stringify(Object.keys(r._b ?? {})))

  r = await api('/api/verify/ZZZZZZZZZZ')
  check('a code nobody issued is unknown', r._s === 200 && r._b?.status === 'unknown', `${r._s} ${JSON.stringify(r._b?.status)}`)

  r = await api('/api/verify/ab-cd-efgh-ij')
  check('a code typed with decoration is normalised', r._s === 200 && r._b?.status !== 'valid', `${r._s}`)

  console.log('\n--- tamper attempts fail ---')
  // A third event: one fine per student per event is the schema's rule.
  const thirdEvent = await prisma.event.create({
    data: { title: `${tag} assembly three`, date: new Date(Date.now() - 172_800_000), lat: 10.72, lng: 122.56, createdBy: staff.id }
  })
  made.eventIds.push(thirdEvent.id)
  // A new fine after issuance: the certificate is real, the standing is not.
  const later = await prisma.fine.create({ data: { userId: student.id, eventId: thirdEvent.id, kind: 'absent', amountCentavos: 5000 } })
  made.fineIds.push(later.id)
  r = await api(`/api/verify/${clearance?.code}`)
  check('the certificate now reads as no longer cleared', r._s === 200 && r._b?.status === 'no-longer-cleared', `${r._s} ${JSON.stringify(r._b?.status)}`)
  check('but it still says when it was issued', !!r._b?.issuedAt, `${r._b?.issuedAt}`)

  await prisma.fine.update({ where: { id: later.id }, data: { status: 'waived', waivedAt: new Date(), waivedBy: staff.id, waiveReason: 'Excused' } })
  r = await api(`/api/verify/${clearance?.code}`)
  check('waiving it makes the certificate valid again', r._b?.status === 'valid', `${JSON.stringify(r._b?.status)}`)

  r = await api('/api/clearance/revoke', { method: 'POST', token: manager.token, body: { clearanceId: clearance?.id, note: 'Issued in error' } })
  check('staff can revoke a certificate (200)', r._s === 200 && !!r._b?.clearance?.revokedAt, `${r._s}`)
  r = await api(`/api/verify/${clearance?.code}`)
  check('and verification reports the revocation', r._b?.status === 'revoked', `${JSON.stringify(r._b?.status)}`)

  r = await api('/api/clearance/revoke', { method: 'POST', token: student.token, body: { clearanceId: clearance?.id } })
  check('a student cannot revoke one (403)', r._s === 403, `${r._s}`)

  console.log('\n--- Student 360 carries the money trail ---')
  r = await api(`/api/analytics/students/${student.id}`, { token: manager.token })
  check('the payments are listed (200)', r._s === 200 && (r._b?.finances?.payments ?? []).length === 2, `${r._s} ${(r._b?.finances?.payments ?? []).length}`)
  check('and the certificate is shown', r._b?.finances?.clearance?.code === clearance?.code, `${r._b?.finances?.clearance?.code}`)
  check('while the clearing standing is recomputed', r._b?.finances?.cleared === true, `${r._b?.finances?.cleared}`)

  r = await api(`/api/analytics/students/${other.id}`, { token: other.token })
  check('a different student has no money trail', r._s === 200 && (r._b?.finances?.payments ?? []).length === 0 && r._b?.finances?.clearance === null, `${r._s}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  await prisma.clearance.deleteMany({ where: { userId: { in: made.userIds } } })
  await prisma.payment.deleteMany({ where: { userId: { in: made.userIds } } })
  await prisma.excuse.deleteMany({ where: { fineId: { in: made.fineIds } } })
  await prisma.fine.deleteMany({ where: { userId: { in: made.userIds } } })
  if (made.eventIds.length) {
    await prisma.fine.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.attendance.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.fineRule.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  }
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } })
  if (made.userIds.length) {
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { createdBy: { in: made.userIds } }] } })
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: made.userIds } } })
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { performedBy: { in: made.userIds } }] } })
  }
  for (const id of made.userIds) {
    await prisma.studentProfile.deleteMany({ where: { userId: id } })
    await prisma.user.delete({ where: { id } }).catch(() => {})
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
}

main()
  .catch((e) => { fail++; console.error('E2E error:', e) })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail ? 1 : 0)
  })
