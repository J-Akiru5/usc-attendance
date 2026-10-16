// Live end-to-end test of student self-registration, verification gating, officer-recorded
// check-in via the student's QR, e-signature, and signed exports. Uses throwaway data in the
// connected DB (deleted at the end) and STUBS the email sender - no real email is sent.
// Run: npx tsx scripts/e2e/students.e2e.mts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import ExcelJS from 'exceljs'
import { Jimp } from 'jimp'
import { resend } from '../../api/_lib/resend.js'
import * as S from '../../api/_handlers/students.js'
import * as G from '../../api/_handlers/signatures.js'
import * as A from '../../api/_handlers/attendance.js'
import * as U from '../../api/_handlers/auth.js'
import * as Du from '../../api/_handlers/duties.js'

process.env.QR_SECRET ||= 'e2e-' + randomBytes(8).toString('hex')
process.env.RESEND_FROM_EMAIL ||= 'e2e@example.invalid'

const sent: { to: string; html: string }[] = []
;(resend.emails as any).send = async (m: any) => { sent.push({ to: m.to, html: m.html }); return { data: { id: 'stub' }, error: null } }

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2estu' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}
function res() {
  const r: any = { _s: 0, _b: undefined, _h: {} }
  r.status = (c: number) => { r._s = c; return r }
  r.json = (b: any) => { r._b = b; return r }
  r.send = (b: any) => { r._b = b; return r }
  r.end = () => r
  r.setHeader = (k: string, v: string) => { r._h[k] = v }
  return r
}
const rq = (token: string | null, method: string, body: any = {}, query: any = {}, headers: any = {}) =>
  ({ headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, method, body, query }) as any

const ids: string[] = []
let eventId = ''

async function mkStaff() {
  const email = `${tag}-staff@example.invalid`
  const password = randomBytes(12).toString('base64url') + 'aA1!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await prisma.user.create({ data: { id: data.user.id, email, name: 'E2E Staff', position: 'Staff', role: 'staff', mustChangePassword: false, active: true } })
  const { data: s } = await anon().auth.signInWithPassword({ email, password })
  ids.push(data.user.id)
  return { id: data.user.id, token: s.session!.access_token }
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
  let r = res()
  await S.register(rq(null, 'POST', { email: 'x@gmail.com', name: 'Juan Cruz', studentNo: '22-0001', consent: true }, {}, { 'x-forwarded-for': '9.9.9.1' }), r)
  check('non-school email rejected (400)', r._s === 400, `${r._s}`)
  r = res()
  await S.register(rq(null, 'POST', { email: mail('a'), name: 'Juan Cruz', studentNo: '22-0001', consent: false }, {}, { 'x-forwarded-for': '9.9.9.1' }), r)
  check('missing privacy consent rejected (400)', r._s === 400, `${r._s}`)

  const emailA = mail('a'), passA = pw(), noA = 'E2E-' + Date.now().toString().slice(-7)
  r = res()
  await S.register(rq(null, 'POST', { email: emailA, name: 'Juan Dela Cruz', studentNo: noA, program: 'BSIT', consent: true }, {}, { 'x-forwarded-for': '9.9.9.2' }), r)
  check('valid registration returns the generic message (200)', r._s === 200 && /eligible/.test(r._b?.message), `${r._s} ${JSON.stringify(r._b)}`)
  const rowA = await prisma.user.findUnique({ where: { email: emailA }, include: { studentProfile: true } })
  check('student row + profile created with role student', rowA?.role === 'student' && rowA.studentProfile?.studentNo === noA && rowA.mustChangePassword === false)
  if (rowA) ids.push(rowA.id)
  check('verification email was "sent" once with a link', sent.length === 1 && sent[0].to === emailA && sent[0].html.includes('Verify email'), `sent=${sent.length}`)

  // Re-registering while still unverified replaces the pending sign-up and re-sends the link.
  r = res()
  await S.register(rq(null, 'POST', { email: emailA, name: 'Juan Dela Cruz', studentNo: noA, program: 'BSIT', consent: true }, {}, { 'x-forwarded-for': '9.9.9.3' }), r)
  check('retry while unverified: generic answer, link re-sent, still ONE account', r._s === 200 && sent.length === 2 && (await prisma.user.count({ where: { email: emailA } })) === 1, `${r._s} sent=${sent.length}`)
  const rowA3 = await prisma.user.findUnique({ where: { email: emailA } })
  if (rowA3) ids.push(rowA3.id)

  const emailB = mail('b')
  r = res()
  await S.register(rq(null, 'POST', { email: emailB, name: 'Thief Person', studentNo: noA, consent: true }, {}, { 'x-forwarded-for': '9.9.9.5' }), r)
  check('taken student ID: generic answer, no account created', r._s === 200 && (await prisma.user.count({ where: { email: emailB } })) === 0)

  const limited = mail('lim')
  let last = 0
  for (let i = 0; i < 4; i++) {
    const rr = res()
    await S.register(rq(null, 'POST', { email: limited, name: 'Rate Limit', studentNo: 'E2E-L' + i + Date.now().toString().slice(-5), consent: true }, {}, { 'x-forwarded-for': '9.9.8.' + i }), rr)
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
    r = res(); await U.me(rq(sIn.session.access_token, 'GET'), r)
    check('unverified student is refused by the API (403)', r._s === 403 && /verify/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
  } else {
    check('unverified student cannot even sign in (Supabase setting)', true)
  }
  await admin.auth.admin.updateUserById(rowA3!.id, { email_confirm: true })
  const { data: sOk, error: sErr } = await anon().auth.signInWithPassword({ email: emailA, password: passA })
  if (sErr || !sOk.session) throw sErr ?? new Error('sign-in failed after verification')
  const st = sOk.session.access_token
  r = res(); await U.me(rq(st, 'GET'), r)
  check('verified student can load their profile (200, role student)', r._s === 200 && r._b?.role === 'student', `${r._s} ${JSON.stringify(r._b)}`)
  const before = sent.length
  r = res()
  await S.register(rq(null, 'POST', { email: emailA, name: 'Someone Else', studentNo: 'E2E-0000001', consent: true }, {}, { 'x-forwarded-for': '9.9.9.6' }), r)
  check('re-registering a VERIFIED email changes nothing and sends nothing', r._s === 200 && sent.length === before && (await prisma.user.findUnique({ where: { email: emailA } }))?.name === 'Juan Dela Cruz', `${r._s}`)

  console.log('\n--- students are limited to their own flows ---')
  r = res(); await A.index(rq(st, 'POST', { type: 'event', eventId, userId: rowA3!.id, method: 'self', lat: 10.72, lng: 122.56 }), r)
  check('student cannot self check-in (403)', r._s === 403, `${r._s}`)
  r = res(); await A.index(rq(st, 'GET', {}, { eventId }), r)
  check('student cannot read the roster (403)', r._s === 403, `${r._s}`)
  r = res(); await Du.duties(rq(st, 'GET'), r)
  check('student cannot use duties (403)', r._s === 403, `${r._s}`)
  r = res(); await U.users(rq(st, 'PUT', { name: 'Hacked', position: 'President' }), r)
  check('student cannot rename themselves (403)', r._s === 403, `${r._s}`)
  r = res(); await U.users(rq(st, 'GET'), r)
  check('student cannot list users (403)', r._s === 403, `${r._s}`)

  console.log('\n--- officer scans the student QR, student signs ---')
  r = res(); await A.qrToken(rq(st, 'POST', { eventId }), r)
  check('student gets a QR token (200)', r._s === 200 && !!r._b?.token, `${r._s}`)
  const qr = r._b.token
  r = res(); await A.qr(rq(staff.token, 'POST', { token: qr }), r)
  check('officer scan records the student (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  const attendanceId = r._b?.id as string

  r = res(); await G.pendingSignature(rq(st, 'GET'), r)
  check('student sees one pending signature', r._s === 200 && r._b.length === 1 && r._b[0].id === attendanceId, `${r._s} ${JSON.stringify(r._b)}`)
  r = res(); await G.sign(rq(st, 'POST', { attendanceId, signature: await inkPng(false) }), r)
  check('blank signature rejected (400)', r._s === 400, `${r._s}`)
  r = res(); await G.sign(rq(st, 'POST', { attendanceId, signature: 'data:text/html;base64,PGI+' }), r)
  check('non-PNG rejected (400)', r._s === 400, `${r._s}`)

  const emailC = mail('c'), passC = pw()
  await S.register(rq(null, 'POST', { email: emailC, name: 'Maria Santos', studentNo: 'E2E-C' + Date.now().toString().slice(-6), consent: true }, {}, { 'x-forwarded-for': '9.9.9.7' }), res())
  const rowC = await prisma.user.findUnique({ where: { email: emailC } })
  if (rowC) { ids.push(rowC.id); await admin.auth.admin.updateUserById(rowC.id, { password: passC, email_confirm: true }) }
  const { data: sC } = await anon().auth.signInWithPassword({ email: emailC, password: passC })
  r = res(); await G.sign(rq(sC.session!.access_token, 'POST', { attendanceId, signature: await inkPng() }), r)
  check("cannot sign someone else's attendance (404)", r._s === 404, `${r._s}`)

  r = res(); await G.sign(rq(st, 'POST', { attendanceId, signature: await inkPng() }), r)
  check('valid signature accepted (201) with a SIG- reference', r._s === 201 && /^SIG-[0-9A-F]{10}$/.test(r._b?.ref ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
  const ref = r._b?.ref as string
  r = res(); await G.sign(rq(st, 'POST', { attendanceId, signature: await inkPng() }), r)
  check('signing twice rejected (409)', r._s === 409, `${r._s}`)
  r = res(); await G.pendingSignature(rq(st, 'GET'), r)
  check('nothing pending afterwards', r._s === 200 && r._b.length === 0, `${JSON.stringify(r._b)}`)

  console.log('\n--- exports carry the signature ---')
  r = res(); await A.index(rq(staff.token, 'GET', {}, { eventId }), r)
  check('roster shows the record as signed', r._s === 200 && !!r._b[0]?.signature?.signedAt, `${r._s}`)
  r = res(); await A.exportAttendance(rq(staff.token, 'GET', {}, { eventId, format: 'csv' }), r)
  check('CSV E-Signature column holds the reference', String(r._b).includes(ref), String(r._b).slice(0, 200))
  r = res(); await A.exportAttendance(rq(staff.token, 'GET', {}, { eventId, format: 'xlsx' }), r)
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r._b)
  check('Excel embeds the signature image', wb.getWorksheet('Attendance')!.getImages().length === 1)
  r = res(); await A.exportAttendance(rq(staff.token, 'GET', {}, { eventId, format: 'pdf' }), r)
  check('PDF export succeeds', r._s === 200 && Buffer.from(r._b).subarray(0, 5).toString() === '%PDF-', `${r._s}`)

  console.log('\n--- deactivated accounts are refused ---')
  await prisma.user.update({ where: { id: staff.id }, data: { active: false } })
  r = res(); await U.me(rq(staff.token, 'GET'), r)
  check('deactivated officer is refused (403)', r._s === 403 && /deactivated/.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  await prisma.attendance.deleteMany({ where: { eventId } }).catch(() => {})
  if (eventId) await prisma.event.delete({ where: { id: eventId } }).catch(() => {})
  // any student rows created under the test tag (even from replaced sign-ups)
  const strays = await prisma.user.findMany({ where: { email: { startsWith: tag } }, select: { id: true } })
  const all = [...new Set([...ids, ...strays.map((s) => s.id)])]
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
