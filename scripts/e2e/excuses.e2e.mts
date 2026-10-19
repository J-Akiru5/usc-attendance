// Live end-to-end test: excuse requests (plan §8.5). A student files an excuse
// (optionally with evidence), staff approve or deny it, and approving waives the
// fine — with the reviewer and reason recorded. Throwaway data, deleted after.
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

const tag = 'e2eexc' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], eventIds: string[], fineIds: string[], excuseIds: string[] } = { userIds: [], eventIds: [], fineIds: [], excuseIds: [] }

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

// A 1x1 transparent PNG, base64 — small, valid, and enough to prove the round trip.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const student = await mkUser('student', { role: 'student' })
  const other = await mkUser('other', { role: 'student' })

  const event = await prisma.event.create({
    data: { title: `${tag} assembly`, date: new Date(Date.now() - 86_400_000), lat: 10.72, lng: 122.56, createdBy: staff.id }
  })
  made.eventIds.push(event.id)

  const fine = await prisma.fine.create({
    data: { userId: student.id, eventId: event.id, kind: 'absent', amountCentavos: 5000, ruleSnapshot: { absentCentavos: 5000 } }
  })
  const secondFine = await prisma.fine.create({
    data: { userId: other.id, eventId: event.id, kind: 'late', amountCentavos: 2500, ruleSnapshot: { lateCentavos: 2500 } }
  })
  made.fineIds.push(fine.id, secondFine.id)

  console.log('\n--- filing ---')
  let r = await api(`/api/fines/${fine.id}/excuse`, {
    method: 'POST',
    token: student.token,
    body: { category: 'medical', reason: 'I was in the clinic with a fever the whole morning.' }
  })
  const excuseId = r._b?.excuse?.id
  if (r._s === 201) made.excuseIds.push(excuseId)
  check('a student files an excuse (201, pending)', r._s === 201 && r._b?.excuse?.status === 'pending', `${r._s} ${JSON.stringify(r._b?.excuse?.status)}`)

  r = await api(`/api/fines/${fine.id}/excuse`, {
    method: 'POST',
    token: student.token,
    body: { category: 'medical', reason: 'A second one before the first is reviewed.' }
  })
  check('a second pending excuse is refused (409)', r._s === 409, `${r._s}`)

  r = await api(`/api/fines/${fine.id}/excuse`, { method: 'POST', token: other.token, body: { reason: 'Somebody else trying it.' } })
  check('nobody can excuse someone else\'s fine (403)', r._s === 403, `${r._s}`)

  // A fine with no pending excuse, so the body's own validation is reached:
  // the "already waiting" refusal (409) would otherwise mask a 400.
  const quietEvent = await prisma.event.create({
    data: { title: `${tag} quiet`, date: new Date(Date.now() - 172_800_000), lat: 10.72, lng: 122.56, createdBy: staff.id }
  })
  made.eventIds.push(quietEvent.id)
  const spareFine = await prisma.fine.create({ data: { userId: student.id, eventId: quietEvent.id, kind: 'late', amountCentavos: 2500 } })
  made.fineIds.push(spareFine.id)

  r = await api(`/api/fines/${spareFine.id}/excuse`, { method: 'POST', token: student.token, body: { reason: 'too short' } })
  check('a too-short reason is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- the queue and the evidence ---')
  r = await api('/api/excuses?status=pending', { token: staff.token })
  check('staff see the pending queue (200)', r._s === 200 && (r._b?.excuses ?? []).some((x: { id: string }) => x.id === excuseId), `${r._s} ${(r._b?.excuses ?? []).length}`)

  r = await api('/api/excuses?status=pending', { token: student.token })
  check('a student cannot read the queue (403)', r._s === 403, `${r._s}`)

  // A second fine, filed with evidence this time.
  r = await api(`/api/fines/${secondFine.id}/excuse`, {
    method: 'POST',
    token: other.token,
    body: {
      category: 'academic',
      reason: 'I was sitting an exam that the college scheduled at the same hour.',
      attachment: { mime: 'image/png', dataBase64: PNG_BASE64 }
    }
  })
  const withAttachment = r._b?.excuse?.id
  if (r._s === 201) made.excuseIds.push(withAttachment)
  check('an excuse with evidence is accepted (201)', r._s === 201 && !!r._b?.excuse?.attachmentKey, `${r._s} ${JSON.stringify(r._b?.excuse?.attachmentKey)}`)

  const attachment = await fetch(`${process.env.BASE_URL}/api/excuses/${withAttachment}/attachment`, { headers: { Authorization: `Bearer ${staff.token}` } })
  const bytes = new Uint8Array(await attachment.arrayBuffer())
  check('staff can open the evidence (200, image/png)', attachment.status === 200 && attachment.headers.get('content-type')?.includes('image/png') === true, `${attachment.status} ${attachment.headers.get('content-type')}`)
  check('and it is the file that was sent', bytes.length > 20 && bytes[0] === 0x89 && bytes[1] === 0x50, `${bytes.length}`)

  const forbidden = await fetch(`${process.env.BASE_URL}/api/excuses/${withAttachment}/attachment`, { headers: { Authorization: `Bearer ${student.token}` } })
  check('another student cannot (403)', forbidden.status === 403, `${forbidden.status}`)

  r = await api(`/api/fines/${spareFine.id}/excuse`, {
    method: 'POST',
    token: student.token,
    body: { reason: 'Trying with the wrong kind of file here.', attachment: { mime: 'application/x-msdownload', dataBase64: PNG_BASE64 } }
  })
  check('an executable attachment is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- approving waives, denying does not ---')
  r = await api(`/api/excuses/${excuseId}/review`, { method: 'POST', token: staff.token, body: { decision: 'approve', note: 'Certificate accepted.' } })
  check('staff approve the excuse (200)', r._s === 200 && r._b?.fineStatus === 'waived', `${r._s} ${JSON.stringify(r._b)}`)

  const waived = await prisma.fine.findUnique({ where: { id: fine.id } })
  check('the fine is waived with the reviewer recorded', waived?.status === 'waived' && waived.waivedBy === staff.id && waived.waiveReason === 'Certificate accepted.', `${waived?.status} ${waived?.waiveReason}`)

  const notes = await prisma.notification.findMany({ where: { userId: student.id, kind: 'excuse_approved' } })
  check('the student is told it was approved', notes.length === 1, `${notes.length}`)

  r = await api(`/api/excuses/${excuseId}/review`, { method: 'POST', token: staff.token, body: { decision: 'approve' } })
  check('reviewing twice is refused (409)', r._s === 409, `${r._s}`)

  r = await api(`/api/excuses/${withAttachment}/review`, { method: 'POST', token: staff.token, body: { decision: 'deny' } })
  check('a denial is recorded (200)', r._s === 200 && r._b?.fineStatus === 'unpaid', `${r._s} ${JSON.stringify(r._b?.fineStatus)}`)
  const stillOwed = await prisma.fine.findUnique({ where: { id: secondFine.id } })
  check('and the fine stays unpaid', stillOwed?.status === 'unpaid', `${stillOwed?.status}`)

  r = await api(`/api/excuses/${withAttachment}/review`, { method: 'POST', token: other.token, body: { decision: 'approve' } })
  check('a student cannot review an excuse (403)', r._s === 403, `${r._s}`)

  console.log('\n--- settled fines cannot be excused or waived ---')
  await prisma.fine.update({ where: { id: secondFine.id }, data: { status: 'paid', paidAt: new Date() } })
  r = await api(`/api/fines/${secondFine.id}/excuse`, { method: 'POST', token: other.token, body: { reason: 'One more try on a settled fine.' } })
  check('a settled fine cannot be excused (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.excuseIds.length) await prisma.excuse.deleteMany({ where: { id: { in: made.excuseIds } } })
  await prisma.excuse.deleteMany({ where: { fineId: { in: made.fineIds } } })
  if (made.fineIds.length) await prisma.fine.deleteMany({ where: { id: { in: made.fineIds } } })
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
