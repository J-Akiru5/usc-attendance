// Live end-to-end test of student self-registration, verification gating, officer-recorded
// check-in via the student's QR, e-signature, and signed exports. Every call goes through the
// real Nitro routes over HTTP. Uses throwaway data in the connected DB (deleted at the end);
// emails land in the runner's local capture inbox - no real email is ever sent.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import ExcelJS from 'exceljs'
import { Jimp } from 'jimp'
import { api, capturedEmails, clearCapturedEmails, type CapturedEmail } from './client.mts'

process.env.QR_SECRET ||= 'e2e-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= 'http://localhost:3000'
process.env.RESEND_FROM_EMAIL ||= 'e2e@example.invalid'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const AT = { lat: 10.72, lng: 122.56, accuracy: 10 } // at the throwaway event's venue
const tag = 'e2estu' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const settle = () => new Promise(resolve => setTimeout(resolve, 200))

// The server sends the email and the capture inbox records it asynchronously, so poll
// briefly until the expected messages have arrived (up to 15 attempts, 200ms apart).
async function waitForEmails(to: string, n: number): Promise<CapturedEmail[]> {
  let mine: CapturedEmail[] = []
  for (let i = 0; i < 15; i++) {
    mine = (await capturedEmails()).filter(m => m.to === to)
    if (mine.length >= n) return mine
    await settle()
  }
  return mine
}

const ids: string[] = []
let eventId = ''

/**
 * Signing in right after the admin API sets a password can race Supabase's auth
 * propagation: the answer comes back without a session. Two retries settle it,
 * and a persistent failure says exactly what happened.
 */
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

async function mkStaff(key = 'staff', role = 'staff') {
  const email = `${tag}-${key}@example.invalid`
  const password = randomBytes(12).toString('base64url') + 'aA1!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await prisma.user.create({ data: { id: data.user.id, email, name: 'E2E ' + key, position: 'Staff', role, mustChangePassword: false, active: true } })
  const session = await signIn(email, password)
  ids.push(data.user.id)
  return { id: data.user.id, token: session.access_token }
}

async function inkPng(draw = true) {
  const img = new Jimp({ width: 400, height: 150, color: 0x00000000 })
  if (draw) for (let x = 20; x < 300; x++) for (let t = 0; t < 4; t++) img.setPixelColor(0x000000ff, x, 60 + t + (x % 20))
  return 'data:image/png;base64,' + (await img.getBuffer('image/png')).toString('base64')
}

const mail = (n: string) => `${tag}-${n}@isufst.edu.ph`
const pw = () => 'Pw-' + randomBytes(9).toString('base64url') + '9'

async function main() {
  const staff = await mkStaff()
  const ev = await prisma.event.create({ data: { title: `${tag} Assembly`, date: new Date(), lat: 10.72, lng: 122.56, radiusMeters: 50, createdBy: staff.id } })
  eventId = ev.id

  console.log('\n--- registration rules ---')
  let r = await api('/api/auth/register', { method: 'POST', body: { email: 'x@gmail.com', name: 'Juan Cruz', studentNo: '22-0001', consent: true }, headers: { 'x-forwarded-for': '9.9.9.1' } })
  check('non-school email rejected (400)', r._s === 400, `${r._s}`)
  r = await api('/api/auth/register', { method: 'POST', body: { email: mail('a'), name: 'Juan Cruz', studentNo: '22-0001', consent: false }, headers: { 'x-forwarded-for': '9.9.9.1' } })
  check('missing privacy consent rejected (400)', r._s === 400, `${r._s}`)

  const emailA = mail('a'), passA = pw(), noA = 'E2E-' + Date.now().toString().slice(-7)
  await clearCapturedEmails() // from here on the capture inbox only sees this suite's mail
  r = await api('/api/auth/register', { method: 'POST', body: { email: emailA, name: 'Juan Dela Cruz', studentNo: noA, program: 'BSIT', consent: true }, headers: { 'x-forwarded-for': '9.9.9.2' } })
  check('valid registration returns the generic message (200)', r._s === 200 && /eligible/.test(r._b?.message), `${r._s} ${JSON.stringify(r._b)}`)
  const rowA = await prisma.user.findUnique({ where: { email: emailA }, include: { studentProfile: true } })
  check('student row + profile created with role student', rowA?.role === 'student' && rowA.studentProfile?.studentNo === noA && rowA.mustChangePassword === false)
  if (rowA) ids.push(rowA.id)
  const regEmails = await waitForEmails(emailA, 1)
  check('verification email was "sent" once with a link', regEmails.length === 1 && regEmails[0].html.includes('Verify email'), `sent=${regEmails.length}`)

  // Re-registering while still unverified replaces the pending sign-up and re-sends the link.
  r = await api('/api/auth/register', { method: 'POST', body: { email: emailA, name: 'Juan Dela Cruz', studentNo: noA, program: 'BSIT', consent: true }, headers: { 'x-forwarded-for': '9.9.9.3' } })
  const retryEmails = await waitForEmails(emailA, 2)
  check('retry while unverified: generic answer, link re-sent, still ONE account', r._s === 200 && retryEmails.length === 2 && (await prisma.user.count({ where: { email: emailA } })) === 1, `${r._s} sent=${retryEmails.length}`)
  const rowA3 = await prisma.user.findUnique({ where: { email: emailA } })
  if (rowA3) ids.push(rowA3.id)

  const emailB = mail('b')
  r = await api('/api/auth/register', { method: 'POST', body: { email: emailB, name: 'Thief Person', studentNo: noA, consent: true }, headers: { 'x-forwarded-for': '9.9.9.5' } })
  check('taken student ID: generic answer, no account created', r._s === 200 && (await prisma.user.count({ where: { email: emailB } })) === 0)

  const limited = mail('lim')
  let last = 0
  for (let i = 0; i < 4; i++) {
    const rr = await api('/api/auth/register', { method: 'POST', body: { email: limited, name: 'Rate Limit', studentNo: 'E2E-L' + i + Date.now().toString().slice(-5), consent: true }, headers: { 'x-forwarded-for': '9.9.8.' + i } })
    last = rr._s
  }
  check('4th attempt for one email in an hour is rate limited (429)', last === 429, `${last}`)
  const lim = await prisma.user.findUnique({ where: { email: limited } })
  if (lim) ids.push(lim.id)

  console.log('\n--- email verification gate ---')
  // Stand in for the student choosing a password on the page the email link opens.
  await admin.auth.admin.updateUserById(rowA3!.id, { password: passA })
  const c = anon()
  const { data: sIn } = await c.auth.signInWithPassword({ email: emailA, password: passA })
  if (sIn.session) {
    r = await api('/api/auth/me', { token: sIn.session.access_token })
    check('unverified student is refused by the API (403)', r._s === 403 && /verify/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
  } else {
    check('unverified student cannot even sign in (Supabase setting)', true)
  }
  await admin.auth.admin.updateUserById(rowA3!.id, { email_confirm: true })
  const st = (await signIn(emailA, passA)).access_token
  r = await api('/api/auth/me', { token: st })
  check('verified student can load their profile (200, role student)', r._s === 200 && r._b?.role === 'student', `${r._s} ${JSON.stringify(r._b)}`)
  const before = (await capturedEmails()).length
  r = await api('/api/auth/register', { method: 'POST', body: { email: emailA, name: 'Someone Else', studentNo: 'E2E-0000001', consent: true }, headers: { 'x-forwarded-for': '9.9.9.6' } })
  await settle() // give a wrongly-sent mail a chance to reach the capture inbox
  check('re-registering a VERIFIED email changes nothing and sends nothing', r._s === 200 && (await capturedEmails()).length === before && (await prisma.user.findUnique({ where: { email: emailA } }))?.name === 'Juan Dela Cruz', `${r._s}`)

  console.log('\n--- students are limited to their own flows ---')
  r = await api('/api/attendance', { token: st, method: 'POST', body: { type: 'event', eventId, userId: rowA3!.id, method: 'self', lat: 10.72, lng: 122.56 } })
  check('student cannot self check-in (403)', r._s === 403, `${r._s}`)
  r = await api('/api/attendance', { token: st, query: { eventId } })
  check('student cannot read the roster (403)', r._s === 403, `${r._s}`)
  r = await api('/api/duties', { token: st })
  check('student cannot use duties (403)', r._s === 403, `${r._s}`)
  r = await api('/api/auth/users', { token: st, method: 'PUT', body: { name: 'Hacked', position: 'President' } })
  check('student cannot rename themselves (403)', r._s === 403, `${r._s}`)
  r = await api('/api/auth/users', { token: st })
  check('student cannot list users (403)', r._s === 403, `${r._s}`)

  console.log('\n--- officer scans the student QR, student signs ---')
  r = await api('/api/attendance/qr-token', { token: st, method: 'POST', body: { eventId } })
  check('student gets a QR token (200)', r._s === 200 && !!r._b?.token, `${r._s}`)
  const qr = r._b.token
  r = await api('/api/attendance/qr', { token: staff.token, method: 'POST', body: { ...AT, token: qr } })
  check('officer scan records the student (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  const attendanceId = r._b?.id as string

  r = await api('/api/attendance/pending-signature', { token: st })
  check('student sees one pending signature', r._s === 200 && r._b.length === 1 && r._b[0].id === attendanceId, `${r._s} ${JSON.stringify(r._b)}`)
  r = await api('/api/attendance/sign', { token: st, method: 'POST', body: { attendanceId, signature: await inkPng(false) } })
  check('blank signature rejected (400)', r._s === 400, `${r._s}`)
  r = await api('/api/attendance/sign', { token: st, method: 'POST', body: { attendanceId, signature: 'data:text/html;base64,PGI+' } })
  check('non-PNG rejected (400)', r._s === 400, `${r._s}`)

  const emailC = mail('c'), passC = pw()
  const noC = 'E2E-C' + Date.now().toString().slice(-6)
  await api('/api/auth/register', { method: 'POST', body: { email: emailC, name: 'Maria Santos', studentNo: noC, consent: true }, headers: { 'x-forwarded-for': '9.9.9.7' } })
  const rowC = await prisma.user.findUnique({ where: { email: emailC } })
  if (rowC) { ids.push(rowC.id); await admin.auth.admin.updateUserById(rowC.id, { password: passC, email_confirm: true }) }
  const sessionC = await signIn(emailC, passC)
  r = await api('/api/attendance/sign', { token: sessionC.access_token, method: 'POST', body: { attendanceId, signature: await inkPng() } })
  check('cannot sign someone else\'s attendance (404)', r._s === 404, `${r._s}`)

  r = await api('/api/attendance/sign', { token: st, method: 'POST', body: { attendanceId, signature: await inkPng() } })
  check('valid signature accepted (201) with a SIG- reference', r._s === 201 && /^SIG-[0-9A-F]{10}$/.test(r._b?.ref ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
  const ref = r._b?.ref as string
  r = await api('/api/attendance/sign', { token: st, method: 'POST', body: { attendanceId, signature: await inkPng() } })
  check('signing twice rejected (409)', r._s === 409, `${r._s}`)
  r = await api('/api/attendance/pending-signature', { token: st })
  check('nothing pending afterwards', r._s === 200 && r._b.length === 0, `${JSON.stringify(r._b)}`)

  console.log('\n--- exports carry the signature ---')
  r = await api('/api/attendance', { token: staff.token, query: { eventId } })
  check('roster shows the record as signed', r._s === 200 && !!r._b[0]?.signature?.signedAt, `${r._s}`)
  r = await api('/api/attendance/export', { token: staff.token, query: { eventId, format: 'csv' } })
  check('CSV E-Signature column holds the reference', String(r._b).includes(ref), String(r._b).slice(0, 200))
  r = await api('/api/attendance/export', { token: staff.token, query: { eventId, format: 'xlsx' } })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(r._b)
  check('Excel embeds the signature image', wb.getWorksheet('Attendance')!.getImages().length === 1)
  r = await api('/api/attendance/export', { token: staff.token, query: { eventId, format: 'pdf' } })
  check('PDF export succeeds', r._s === 200 && Buffer.from(r._b).subarray(0, 5).toString() === '%PDF-', `${r._s}`)

  console.log('\n--- student administration (super_admin) ---')
  const sa = await mkStaff('superadmin', 'super_admin')
  r = await api('/api/students', { token: staff.token })
  check('plain staff cannot list students (403)', r._s === 403, `${r._s}`)
  r = await api('/api/students', { token: st })
  check('a student cannot list students (403)', r._s === 403, `${r._s}`)
  r = await api('/api/students', { token: sa.token, query: { q: 'Juan' } })
  check('super_admin can search students (200)', r._s === 200 && r._b.students.some((x: any) => x.id === rowA3!.id), `${r._s} ${JSON.stringify(r._b)?.slice(0, 160)}`)
  r = await api('/api/students/' + rowA3!.id, { token: sa.token, method: 'PATCH', body: { name: 'Juan D. Cruz', program: 'BSCS' } })
  check('super_admin can correct name/program (200)', r._s === 200 && r._b.name === 'Juan D. Cruz' && r._b.studentProfile.program === 'BSCS', `${r._s} ${JSON.stringify(r._b)}`)
  r = await api('/api/students/' + rowA3!.id, { token: sa.token, method: 'PATCH', body: { studentNo: noC } })
  check('duplicate student ID is refused (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)
  r = await api('/api/students/' + rowA3!.id, { token: sa.token, method: 'PATCH', body: { name: '<b>x</b>' } })
  check('invalid name is refused (400)', r._s === 400, `${r._s}`)
  r = await api('/api/students/' + rowA3!.id, { token: st, method: 'PATCH', body: { name: 'Self Edit' } })
  check('a student cannot edit students (403)', r._s === 403, `${r._s}`)
  r = await api('/api/students/' + rowA3!.id, { token: sa.token, method: 'PATCH', body: { active: false } })
  check('super_admin can deactivate (200)', r._s === 200 && r._b.active === false, `${r._s}`)
  r = await api('/api/attendance/qr-token', { token: st, method: 'POST', body: { eventId } })
  check('deactivated student is locked out immediately (403)', r._s === 403 && /deactivated/.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
  r = await api('/api/students/' + rowA3!.id, { token: sa.token, method: 'PATCH', body: { active: true } })
  check('reactivation works (200)', r._s === 200 && r._b.active === true, `${r._s}`)
  r = await api('/api/students/' + staff.id, { token: sa.token, method: 'PATCH', body: { name: 'x' } })
  check('cannot use the student endpoint on an officer (404)', r._s === 404, `${r._s}`)

  console.log('\n--- deactivated accounts are refused ---')
  await prisma.user.update({ where: { id: staff.id }, data: { active: false } })
  r = await api('/api/auth/me', { token: staff.token })
  check('deactivated officer is refused (403)', r._s === 403 && /deactivated/.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  await prisma.attendance.deleteMany({ where: { eventId } }).catch(() => {})
  if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => {})
  // any student rows created under the test tag (even from replaced sign-ups)
  const strays = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true } })
  const all = [...new Set([...ids, ...strays.map(s => s.id)])]
  await prisma.auditLog.deleteMany({ where: { OR: [{ details: { contains: tag } }, { userId: { in: all } }, { performedBy: { in: all } }] } })
  for (const id of all) {
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
