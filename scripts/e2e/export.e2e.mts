// Live end-to-end test: creates throwaway users/event/attendance in the connected DB,
// exports csv/xlsx/pdf through the real handler, verifies the files, then deletes everything.
// Run: npx tsx scripts/e2e/export.e2e.mts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import * as A from '../../api/_handlers/attendance.js'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2eexp' + Date.now()
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
const made: string[] = []
let eventId = ''

async function mkUser(key: string, role: string, name: string) {
  const email = `${tag}-${key}@example.invalid`
  const password = randomBytes(12).toString('base64url') + 'aA1!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await prisma.user.create({ data: { id: data.user.id, email, name, position: 'Senator', role, mustChangePassword: false, active: true } })
  const { data: s, error: se } = await anon().auth.signInWithPassword({ email, password })
  if (se || !s.session) throw se
  made.push(data.user.id)
  return { id: data.user.id, token: s.session.access_token }
}
const rq = (token: string, query: any) => ({ headers: { authorization: `Bearer ${token}` }, method: 'GET', body: {}, query }) as any

async function main() {
  const staff = await mkUser('staff', 'staff', 'E2E Staff')
  const outsider = await mkUser('outsider', 'client', 'E2E Outsider')
  const a = await mkUser('a', 'client', '=cmd() Aquiño')
  const b = await mkUser('b', 'client', 'Plain Person')
  const ev = await prisma.event.create({ data: { title: `${tag} General/Assembly`, date: new Date(), lat: 10.72, lng: 122.56, radiusMeters: 50, createdBy: staff.id } })
  eventId = ev.id
  await prisma.attendance.create({ data: { type: 'event', eventId, userId: a.id, method: 'qr', recordedBy: staff.id } })
  await prisma.attendance.create({ data: { type: 'event', eventId, userId: b.id, method: 'self', lat: 10.7201, lng: 122.5601, recordedBy: b.id, checkOutAt: new Date() } })

  let r = res(); await A.exportAttendance(rq(staff.token, { eventId }), r)
  check('default format is csv (200)', r._s === 200 && r._h['Content-Type'].startsWith('text/csv'), `${r._s}`)
  check('csv has both rows, E-Signature column, formula neutralised', String(r._b).includes('E-Signature') && String(r._b).includes('\'=cmd()') && String(r._b).includes('Plain Person'))
  check('csv filename is sanitised', /filename="[A-Za-z0-9-]+-attendance\.csv"/.test(r._h['Content-Disposition']), r._h['Content-Disposition'])

  r = res(); await A.exportAttendance(rq(staff.token, { eventId, format: 'xlsx' }), r)
  check('xlsx returns 200 with spreadsheet content type', r._s === 200 && r._h['Content-Type'].includes('spreadsheetml'), `${r._s}`)
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r._b)
  const ws = wb.getWorksheet('Attendance')!
  check('xlsx has header + 2 data rows', ws.getRow(5).getCell(2).value === 'Name' && !!ws.getRow(6).getCell(2).value && !!ws.getRow(7).getCell(2).value)

  r = res(); await A.exportAttendance(rq(staff.token, { eventId, format: 'pdf' }), r)
  check('pdf returns 200 as a real PDF', r._s === 200 && Buffer.from(r._b).subarray(0, 5).toString() === '%PDF-', `${r._s}`)
  check('pdf has 1 page', (await PDFDocument.load(r._b)).getPageCount() === 1)

  r = res(); await A.exportAttendance(rq(staff.token, { eventId, format: 'docx' }), r)
  check('unknown format rejected (400)', r._s === 400, `${r._s}`)
  r = res(); await A.exportAttendance(rq(outsider.token, { eventId, format: 'pdf' }), r)
  check('officer without export access blocked (403)', r._s === 403, `${r._s}`)
  r = res(); await A.exportAttendance(rq(staff.token, { eventId: '00000000-0000-0000-0000-000000000000' }), r)
  check('missing event is 404', r._s === 404, `${r._s}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (eventId) {
    await prisma.attendance.deleteMany({ where: { eventId } })
    await prisma.eventDelegate.deleteMany({ where: { eventId } })
    await prisma.event.delete({ where: { id: eventId } }).catch(() => {})
  }
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made } }, { performedBy: { in: made } }] } })
  for (const id of made) {
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
