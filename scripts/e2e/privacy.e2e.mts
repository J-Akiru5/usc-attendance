// Live end-to-end test of the data-subject rights a student can exercise alone
// (benchmark BC-11): the JSON export contains only the caller's records, a
// rectification request cannot target a derived or financial field, and an
// accepted correction changes the profile and writes exactly one audit row
// naming the requester, the decider and the reason.
//
// Every call goes through the real Nitro routes over HTTP. The throwaway rows
// use @example.invalid addresses and are deleted at the end.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { api } from './client.mts'

process.env.QR_SECRET ||= 'e2e-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= 'http://localhost:3000'
process.env.RESEND_FROM_EMAIL ||= 'e2e@example.invalid'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }
})
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const tag = 'e2epriv' + Date.now()
let pass = 0
let fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

async function signIn(email: string, password: string, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, error } = await anon().auth.signInWithPassword({ email, password })
    if (data.session) return data.session
    if (attempt === attempts) {
      throw new Error(`Sign-in for ${email} returned no session after ${attempts} attempts${error ? `: ${error.message}` : ''}`)
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('unreachable')
}

interface TestUser {
  id: string
  email: string
  name: string
  token: string
  studentNo: string
}

async function mkUser(key: string, role: 'staff' | 'student', name: string, studentNo = ''): Promise<TestUser> {
  const email = `${tag}-${key}@example.invalid`
  const password = randomBytes(12).toString('base64url') + 'aA1!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await prisma.user.create({
    data: {
      id: data.user.id,
      email,
      name,
      position: role === 'student' ? 'Student' : 'Staff',
      role,
      mustChangePassword: false,
      active: true,
      consentAt: new Date('2026-08-01T00:00:00Z'),
      consentVersion: '2026-10',
      consentSource: 'e2e',
      ...(role === 'student' && {
        studentProfile: {
          create: {
            studentNo,
            program: 'BSIT',
            yearLevel: 2
          }
        }
      })
    }
  })
  const session = await signIn(email, password)
  return { id: data.user.id, email, name, token: session.access_token, studentNo }
}

async function main() {
  const staff = await mkUser('staff', 'staff', 'E2E Privacy Staff')
  const alice = await mkUser('alice', 'student', 'Alice E2E Privacy', 'E2E-PRIV-A-' + Date.now().toString().slice(-5))
  const bob = await mkUser('bob', 'student', 'Bobby Foreign Record', 'E2E-PRIV-B-' + Date.now().toString().slice(-5))

  const event = await prisma.event.create({
    data: {
      title: `${tag} Privacy Assembly`,
      date: new Date('2026-10-01T07:00:00Z'),
      lat: 10.72,
      lng: 122.56,
      radiusMeters: 50,
      createdBy: staff.id
    }
  })

  const aliceAttendance = await prisma.attendance.create({
    data: {
      type: 'event',
      eventId: event.id,
      userId: alice.id,
      method: 'qr',
      lat: 10.72,
      lng: 122.56,
      recordedBy: staff.id,
      createdAt: new Date('2026-10-01T08:00:00Z')
    }
  })
  await prisma.attendanceSignature.create({
    data: { attendanceId: aliceAttendance.id, sha256: 'a'.repeat(64), signedAt: new Date('2026-10-01T08:01:00Z') }
  })
  const bobAttendance = await prisma.attendance.create({
    data: {
      type: 'event',
      eventId: event.id,
      userId: bob.id,
      method: 'manual',
      lat: 10.72,
      lng: 122.56,
      recordedBy: staff.id,
      createdAt: new Date('2026-10-01T08:00:00Z')
    }
  })

  const aliceFine = await prisma.fine.create({
    data: {
      userId: alice.id,
      eventId: event.id,
      kind: 'absent',
      sanctionType: 'monetary',
      amountCentavos: 5000,
      status: 'unpaid',
      servedNote: 'internal e2e served note'
    }
  })
  const bobFine = await prisma.fine.create({
    data: {
      userId: bob.id,
      eventId: event.id,
      kind: 'late',
      sanctionType: 'monetary',
      amountCentavos: 2500,
      status: 'paid',
      paidAt: new Date('2026-10-02T00:00:00Z'),
      paymentRef: 'OR-E2E-B-1'
    }
  })

  const aliceClearance = await prisma.clearance.create({
    data: {
      userId: alice.id,
      code: `${tag}-CLR-A`,
      coveredCentavos: 0,
      issuedBy: staff.id,
      note: 'internal e2e clearance note'
    }
  })
  const bobClearance = await prisma.clearance.create({
    data: {
      userId: bob.id,
      code: `${tag}-CLR-B`,
      coveredCentavos: 2500,
      issuedBy: staff.id
    }
  })

  await prisma.excuse.create({
    data: {
      fineId: aliceFine.id,
      userId: alice.id,
      category: 'medical',
      reason: 'E2E clinic note for the absence.',
      status: 'approved',
      reviewedBy: staff.id,
      reviewedAt: new Date('2026-10-03T00:00:00Z'),
      reviewNote: 'internal e2e excuse note'
    }
  })

  console.log('\n--- export is the caller\'s own data ---')
  let r = await api('/api/privacy/export')
  check('anonymous export refused (401)', r._s === 401, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/privacy/export', { token: alice.token })
  check('student export succeeds (200)', r._s === 200, `${r._s} ${JSON.stringify(r._b)?.slice(0, 200)}`)
  check('export is not publicly cacheable', /no-store/.test(r._h['cache-control'] ?? ''), r._h['cache-control'] ?? '(missing)')
  check('export is a download with a filename', /attachment/.test(r._h['content-disposition'] ?? ''), r._h['content-disposition'] ?? '(missing)')

  const bundle = r._b
  const serialised = JSON.stringify(bundle)
  check('export names the caller as the subject', bundle?.subject?.id === alice.id && bundle?.profile?.studentNo === alice.studentNo,
    `${bundle?.subject?.id} / ${bundle?.profile?.studentNo}`)
  check('export carries the caller attendance, fine, clearance and excuse',
    bundle?.attendance?.length === 1 && bundle.attendance[0].id === aliceAttendance.id
    && bundle?.fines?.length === 1 && bundle.fines[0].id === aliceFine.id
    && bundle?.clearances?.length === 1 && bundle.clearances[0].id === aliceClearance.id
    && bundle?.excuses?.length === 1,
    JSON.stringify({
      attendance: bundle?.attendance?.map((x: { id: string }) => x.id),
      fines: bundle?.fines?.map((x: { id: string }) => x.id),
      clearances: bundle?.clearances?.map((x: { id: string }) => x.id),
      excuses: bundle?.excuses?.length
    }))
  check('export never contains another student or their records',
    ![bob.id, bob.email, bob.name, bob.studentNo, bobAttendance.id, bobFine.id, bobClearance.id, 'OR-E2E-B-1']
      .some(value => serialised.includes(value)))
  check('export drops internal notes, staff ids and raw coordinates',
    !['internal e2e served note', 'internal e2e excuse note', 'internal e2e clearance note', staff.id, '"lat"', '"lng"', '10.72']
      .some(value => serialised.includes(value))
      && !/"reviewNote"|"waiveReason"|"servedNote"|"recordedBy"/.test(serialised))

  console.log('\n--- a request may only target a correctable stored field ---')
  r = await api('/api/privacy/requests', {
    token: alice.token,
    method: 'POST',
    body: { field: 'amountCentavos', proposedValue: '0' }
  })
  check('non-correctable field refused (400)', r._s === 400 && /cannot be corrected/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/privacy/requests', { token: alice.token, method: 'POST', body: { field: 'name' } })
  check('missing proposed value refused (400)', r._s === 400 && /corrected value/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/privacy/requests', { token: alice.token, method: 'POST', body: { proposedValue: 'No Field' } })
  check('missing field refused (400)', r._s === 400 && /field/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/privacy/requests', {
    token: alice.token,
    method: 'POST',
    body: { field: 'name', proposedValue: 'Alice Eee Privacy-Corrected', note: 'Middle name was missing.' }
  })
  check('valid rectification request is filed (201, pending)', r._s === 201 && r._b?.status === 'pending', `${r._s} ${JSON.stringify(r._b)}`)
  const nameRequestId = r._b?.id as string

  r = await api('/api/privacy/requests', {
    token: alice.token,
    method: 'POST',
    body: { field: 'name', proposedValue: 'Alice Again' }
  })
  check('a second pending request for the same field is refused (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/privacy/requests', { token: bob.token })
  check('a student cannot read the staff queue (403)', r._s === 403, `${r._s}`)

  r = await api('/api/privacy/requests?status=pending', { token: staff.token })
  check('staff can list the pending queue and see the request', r._s === 200 && r._b?.requests?.some((x: { id: string }) => x.id === nameRequestId),
    `${r._s} ${JSON.stringify(r._b)?.slice(0, 200)}`)

  r = await api(`/api/privacy/requests/${nameRequestId}`, { token: alice.token, method: 'PATCH', body: { status: 'accepted', reason: 'Self-approval' } })
  check('a student cannot decide their own request (403)', r._s === 403, `${r._s}`)

  console.log('\n--- accepting applies the change and audits it once ---')
  const acceptReason = 'Checked against the registrar list.'
  r = await api(`/api/privacy/requests/${nameRequestId}`, { token: staff.token, method: 'PATCH', body: { status: 'accepted' } })
  check('acceptance without a reason is refused (400)', r._s === 400 && /reason/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/privacy/requests/${nameRequestId}`, {
    token: staff.token,
    method: 'PATCH',
    body: { status: 'accepted', reason: acceptReason }
  })
  check('staff acceptance succeeds (200, accepted)', r._s === 200 && r._b?.status === 'accepted', `${r._s} ${JSON.stringify(r._b)}`)

  const me = await api('/api/auth/me', { token: alice.token })
  check('acceptance applied the corrected name', me._s === 200 && me._b?.name === 'Alice Eee Privacy-Corrected', `${me._s} ${me._b?.name}`)

  const acceptedRows = await prisma.auditLog.findMany({
    where: { action: 'privacy_request_accepted', targetType: 'privacy_request', targetId: nameRequestId }
  })
  check('exactly one audit row records the acceptance', acceptedRows.length === 1, `rows=${acceptedRows.length}`)
  const acceptedRow = acceptedRows[0]
  check('the audit row names requester, decider and reason',
    acceptedRow?.userId === alice.id
    && acceptedRow?.performedBy === staff.id
    && (acceptedRow?.details ?? '').includes(alice.id)
    && (acceptedRow?.details ?? '').includes(staff.id)
    && (acceptedRow?.details ?? '').includes(acceptReason),
    acceptedRow?.details ?? '(no row)')

  console.log('\n--- rejection needs a reason and does not change the record ---')
  r = await api('/api/privacy/requests', {
    token: alice.token,
    method: 'POST',
    body: { field: 'yearLevel', proposedValue: '3' }
  })
  check('another correctable field can be requested (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  const yearRequestId = r._b?.id as string

  r = await api(`/api/privacy/requests/${yearRequestId}`, { token: staff.token, method: 'PATCH', body: { status: 'rejected' } })
  check('rejection without a reason is refused (400)', r._s === 400 && /reason/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  const rejectReason = 'The registrar list still says second year.'
  r = await api(`/api/privacy/requests/${yearRequestId}`, {
    token: staff.token,
    method: 'PATCH',
    body: { status: 'rejected', reason: rejectReason }
  })
  check('staff rejection succeeds (200, rejected)', r._s === 200 && r._b?.status === 'rejected', `${r._s} ${JSON.stringify(r._b)}`)

  const profile = await prisma.studentProfile.findUnique({ where: { userId: alice.id }, select: { yearLevel: true } })
  check('rejection left the year level unchanged', profile?.yearLevel === 2, `yearLevel=${profile?.yearLevel}`)

  const rejectedRows = await prisma.auditLog.findMany({
    where: { action: 'privacy_request_rejected', targetType: 'privacy_request', targetId: yearRequestId }
  })
  check('exactly one audit row records the rejection with its reason',
    rejectedRows.length === 1 && (rejectedRows[0]?.details ?? '').includes(rejectReason) && rejectedRows[0]?.performedBy === staff.id,
    `rows=${rejectedRows.length}`)

  r = await api('/api/privacy/export', { token: alice.token })
  check('the export carries the corrected name and the request history',
    r._s === 200 && r._b?.subject?.name === 'Alice Eee Privacy-Corrected'
    && r._b?.privacyRequests?.some((x: { id: string, status: string }) => x.id === nameRequestId && x.status === 'accepted'),
    `${r._s} ${r._b?.subject?.name}`)

  r = await api('/api/privacy/requests/mine', { token: alice.token })
  check('the student sees their own request history', r._s === 200 && r._b?.requests?.length === 2, `${r._s} ${JSON.stringify(r._b)?.slice(0, 160)}`)

  r = await api('/api/privacy/requests/mine', { token: bob.token })
  check('another student sees none of those requests', r._s === 200 && r._b?.requests?.length === 0, `${r._s} ${JSON.stringify(r._b)}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  const strays = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true } })
  const ids = strays.map(row => row.id)
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ details: { contains: tag } }, { userId: { in: ids } }, { performedBy: { in: ids } }] }
    })
    await prisma.privacyRequest.deleteMany({ where: { userId: { in: ids } } }).catch(() => {})
    await prisma.excuse.deleteMany({ where: { userId: { in: ids } } }).catch(() => {})
    await prisma.clearance.deleteMany({ where: { userId: { in: ids } } }).catch(() => {})
    await prisma.fine.deleteMany({ where: { userId: { in: ids } } }).catch(() => {})
    await prisma.attendance.deleteMany({ where: { userId: { in: ids } } }).catch(() => {})
  }
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } }).catch(() => {})
  for (const id of ids) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
}

main()
  .catch((e) => {
    fail++
    console.error('E2E error:', e)
  })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail ? 1 : 0)
  })
