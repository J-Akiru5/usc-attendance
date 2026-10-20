// Live end-to-end test: signature retention per semester, settings managers, semesters, the
// nightly cron entry point, and per-event check-in windows — all through the real Nitro
// routes over HTTP. Uses throwaway users/events/semesters (in the year 2001 so they cannot
// clash with real semesters) and RESTORES the real retention settings afterwards.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import ExcelJS from 'exceljs'
import { api } from './client.mts'

process.env.QR_SECRET ||= 'e2e-' + randomBytes(8).toString('hex')
process.env.CRON_SECRET ||= 'e2e-cron-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2eret' + Date.now()
const startedAt = new Date()
const AT = { lat: 10.72, lng: 122.56, accuracy: 10 }
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const ids: string[] = []
const eventIds: string[] = []
const semIds: string[] = []
const photoFiles: string[] = []
let original: { id: string, keep: number, grace: number, lastPurgeAt: Date | null, lastPurgeCount: number | null } | null = null

async function mkUser(key: string, role: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${key}@example.invalid`
  const password = randomBytes(12).toString('base64url') + 'aA1!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await prisma.user.create({ data: { id: data.user.id, email, name: 'E2E ' + key, position: 'Test', role, mustChangePassword: false, active: true, ...extra } })
  const { data: s } = await anon().auth.signInWithPassword({ email, password })
  ids.push(data.user.id)
  return { id: data.user.id, token: s.session!.access_token }
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

async function main() {
  const s0 = (await prisma.settings.findFirst()) ?? (await prisma.settings.create({ data: {} }))
  original = { id: s0.id, keep: s0.signatureRetentionSemesters, grace: s0.purgeGraceDays, lastPurgeAt: s0.lastPurgeAt, lastPurgeCount: s0.lastPurgeCount }

  const superAdmin = await mkUser('sa', 'super_admin')
  const manager = await mkUser('mgr', 'client', { canConfigure: true })
  const president = await mkUser('pres', 'staff', { canDelegate: true })
  const outsider = await mkUser('out', 'client')
  const staff = await mkUser('staff', 'staff')
  const studentA = await mkUser('s1', 'client')
  const studentB = await mkUser('s2', 'client')

  console.log('\n--- who can change settings ---')
  let r = await api('/api/settings/retention', { token: outsider.token })
  check('ordinary officer blocked (403)', r._s === 403, `${r._s}`)
  r = await api('/api/settings/retention', { token: staff.token })
  check('plain staff blocked (403)', r._s === 403, `${r._s}`)
  for (const [who, u] of [['super admin', superAdmin], ['settings manager (adviser/OIC)', manager], ['President/Secretary', president]] as const) {
    r = await api('/api/settings/retention', { token: u.token })
    check(`${who} allowed (200)`, r._s === 200 && typeof r._b.signatureRetentionSemesters === 'number', `${r._s}`)
  }

  console.log('\n--- retention setting ---')
  r = await api('/api/settings/retention', { token: manager.token, method: 'PUT', body: { signatureRetentionSemesters: 0, purgeGraceDays: 30 } })
  check('0 semesters rejected (400)', r._s === 400, `${r._s}`)
  r = await api('/api/settings/retention', { token: outsider.token, method: 'PUT', body: { signatureRetentionSemesters: 2, purgeGraceDays: 10 } })
  check('non-manager cannot change it (403)', r._s === 403, `${r._s}`)
  r = await api('/api/settings/retention', { token: manager.token, method: 'PUT', body: { signatureRetentionSemesters: 2, purgeGraceDays: 0 } })
  check('manager sets keep=2, grace=0 (200)', r._s === 200 && r._b.signatureRetentionSemesters === 2, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- semesters ---')
  const mk = async (name: string, a: string, b: string) => {
    const x = await api('/api/semesters', { token: manager.token, method: 'POST', body: { name, startsOn: a, endsOn: b } })
    if (x._b?.id) semIds.push(x._b.id)
    return x
  }
  r = await mk(`${tag} S1`, '2001-01-01', '2001-07-01')
  check('define semester 1 (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  r = await mk(`${tag} S2`, '2001-07-01', '2002-01-01')
  check('define back-to-back semester 2 (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  r = await mk(`${tag} overlap`, '2001-06-01', '2001-08-01')
  check('overlapping semester refused (409)', r._s === 409, `${r._s}`)
  r = await api('/api/semesters', { token: outsider.token, method: 'POST', body: { name: 'Nope nope', startsOn: '2010-01-01', endsOn: '2010-06-01' } })
  check('non-manager cannot add a semester (403)', r._s === 403, `${r._s}`)

  console.log('\n--- purge by semester ---')
  const ev = await prisma.event.create({ data: { title: `${tag} old event`, date: new Date('2001-03-01T01:00:00Z'), lat: 10.72, lng: 122.56, radiusMeters: 50, createdBy: staff.id } })
  eventIds.push(ev.id)
  const mkSig = async (userId: string, at: string) => {
    const a = await prisma.attendance.create({ data: { type: 'event', eventId: ev.id, userId, method: 'qr', recordedBy: staff.id, checkOutAt: new Date() } })
    await prisma.attendanceSignature.create({ data: { attendanceId: a.id, png: new Uint8Array(PNG), sha256: randomBytes(32).toString('hex'), signedAt: new Date(at) } })
    return a.id
  }
  const inS1 = await mkSig(studentA.id, '2001-03-05T02:00:00Z')
  const inS2 = await mkSig(studentB.id, '2001-09-05T02:00:00Z')
  const evNow = await prisma.event.create({ data: { title: `${tag} current event`, date: new Date(), lat: 10.72, lng: 122.56, radiusMeters: 50, createdBy: staff.id } })
  eventIds.push(evNow.id)
  const aNow = await prisma.attendance.create({ data: { type: 'event', eventId: evNow.id, userId: studentA.id, method: 'qr', recordedBy: staff.id } })
  await prisma.attendanceSignature.create({ data: { attendanceId: aNow.id, png: new Uint8Array(PNG), sha256: randomBytes(32).toString('hex') } })

  r = await api('/api/settings/purge-signatures', { token: outsider.token, method: 'POST' })
  check('non-manager cannot run a purge (403)', r._s === 403, `${r._s}`)
  r = await api('/api/settings/purge-signatures', { token: manager.token, method: 'POST' })
  const live = async (id: string) => (await prisma.attendanceSignature.findUnique({ where: { attendanceId: id } }))!
  check('keep=2: semester 1 image deleted', r._s === 200 && (await live(inS1)).png === null && (await live(inS1)).purgedAt !== null, `${r._s} ${JSON.stringify(r._b)}`)
  check('keep=2: semester 2 image still kept (waits for a later semester)', (await live(inS2)).png !== null)
  check('a signature outside every semester is never touched', (await live(aNow.id)).png !== null)
  check('attendance row, hash and reference survive a purge', !!(await prisma.attendance.findUnique({ where: { id: inS1 } })) && (await live(inS1)).sha256.length === 64)

  await api('/api/settings/retention', { token: manager.token, method: 'PUT', body: { signatureRetentionSemesters: 1, purgeGraceDays: 0 } })
  r = await api('/api/settings/purge-signatures', { token: manager.token, method: 'POST' })
  check('keep=1: semester 2 image now deleted', (await live(inS2)).png === null, `${JSON.stringify(r._b)}`)
  r = await api('/api/settings/purge-signatures', { token: manager.token, method: 'POST' })
  check('running it again deletes nothing more (idempotent)', r._s === 200 && r._b.purged === 0, `${JSON.stringify(r._b)}`)
  r = await api('/api/settings/retention', { token: manager.token })
  check('settings page data shows last cleanup + unassigned count', !!r._b.lastPurgeAt && r._b.unassignedSignatures >= 1, `${JSON.stringify({ ...r._b, semesters: undefined })}`)

  console.log('\n--- exports after a purge ---')
  r = await api('/api/attendance/export', { token: staff.token, query: { eventId: ev.id, format: 'csv' } })
  check('CSV still carries the SIG- reference', /SIG-[0-9A-F]{10}/.test(String(r._b)), String(r._b).slice(0, 120))
  r = await api('/api/attendance/export', { token: staff.token, query: { eventId: ev.id, format: 'xlsx' } })
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r._b)
  check('Excel notes "image removed" for purged signatures', String(wb.getWorksheet('Attendance')!.getRow(6).getCell(9).value).includes('image removed'), String(wb.getWorksheet('Attendance')!.getRow(6).getCell(9).value))
  r = await api('/api/attendance/export', { token: staff.token, query: { eventId: ev.id, format: 'pdf' } })
  check('PDF export still succeeds', r._s === 200 && Buffer.from(r._b).subarray(0, 5).toString() === '%PDF-', `${r._s}`)

  console.log('\n--- ID photo retention (T-0009) ---')
  const photoRoot = resolve(process.env.ATTENDANCE_PHOTO_STORAGE_DIR ?? '.local/attendance-photos')
  const mkPhotoRow = async (name: string, expiresAt: Date) => {
    const photoKey = `attendance-photos/${tag}-${name}.png`
    const file = resolve(photoRoot, photoKey)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, PNG)
    photoFiles.push(file)
    const row = await prisma.attendance.create({
      data: {
        type: 'event',
        eventId: evNow.id,
        userId: studentA.id,
        method: 'manual',
        manualReason: `e2e photo retention (${name})`,
        recordedBy: staff.id,
        checkOutAt: new Date(),
        photoKey,
        photoCapturedAt: new Date(expiresAt.getTime() - 90 * 86_400_000),
        photoExpiresAt: expiresAt
      }
    })
    return { row, photoKey, file }
  }

  const expiredPhoto = await mkPhotoRow('expired', new Date('2001-03-06T00:00:00Z'))
  const keptPhoto = await mkPhotoRow('kept', new Date(Date.now() + 30 * 86_400_000))

  console.log('\n--- nightly cron entry point ---')
  r = await api('/api/cron/purge-signatures', { method: 'GET' })
  check('cron without the secret is refused (401)', r._s === 401, `${r._s}`)
  r = await api('/api/cron/purge-signatures', { method: 'GET', headers: { authorization: 'Bearer wrong' } })
  check('cron with a wrong secret is refused (401)', r._s === 401, `${r._s}`)
  r = await api('/api/cron/purge-signatures', { method: 'GET', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  check('cron with the right secret runs (200)', r._s === 200 && r._b.purged === 0, `${r._s} ${JSON.stringify(r._b)}`)
  check('the same job deletes the expired ID photo and reports the count', r._s === 200 && r._b.photosPurged >= 1, `${r._s} ${JSON.stringify(r._b)}`)

  const expiredAfter = await prisma.attendance.findUnique({ where: { id: expiredPhoto.row.id } })
  check(
    'the attendance row survives with only the photo columns cleared',
    !!expiredAfter
    && expiredAfter.photoKey === null
    && expiredAfter.photoCapturedAt === null
    && expiredAfter.photoExpiresAt === null
    && expiredAfter.manualReason === 'e2e photo retention (expired)',
    JSON.stringify(expiredAfter && { photoKey: expiredAfter.photoKey, reason: expiredAfter.manualReason })
  )
  check('the expired object is gone from private storage', !existsSync(expiredPhoto.file), expiredPhoto.file)

  const keptAfter = await prisma.attendance.findUnique({ where: { id: keptPhoto.row.id } })
  check('an unexpired photo is left alone', keptAfter?.photoKey === keptPhoto.photoKey && existsSync(keptPhoto.file), `${keptAfter?.photoKey}`)

  const photoAudit = await prisma.auditLog.findFirst({
    where: { action: 'attendance_photos_purged', createdAt: { gte: startedAt } },
    orderBy: { createdAt: 'desc' }
  })
  check('the photo purge count is audited', !!photoAudit && (photoAudit.details ?? '').includes('"purged":1'), photoAudit?.details ?? 'none')

  console.log('\n--- check-in window ---')
  const evW = await prisma.event.create({ data: { title: `${tag} windowed`, date: new Date(), lat: 10.72, lng: 122.56, radiusMeters: 50, createdBy: staff.id } })
  eventIds.push(evW.id)
  const win = async (u: { token: string }, body: Record<string, unknown>) => api(`/api/events/${evW.id}/window`, { token: u.token, method: 'PUT', body })
  r = await win(outsider, { checkInOpensAt: new Date().toISOString() })
  check('non-manager cannot set a window (403)', r._s === 403, `${r._s}`)
  r = await win(manager, { checkInOpensAt: 'garbage' })
  check('invalid time rejected (400)', r._s === 400, `${r._s}`)
  r = await win(manager, { checkInOpensAt: new Date(Date.now() + 2 * 3600e3).toISOString(), checkInClosesAt: new Date(Date.now() + 1 * 3600e3).toISOString() })
  check('closes before opens rejected (400)', r._s === 400, `${r._s}`)

  const scanFor = async (u: { token: string }, subject: { token: string }) => {
    const t = await api('/api/attendance/qr-token', { token: subject.token, method: 'POST', body: { eventId: evW.id } })
    const x = await api('/api/attendance/qr', { token: u.token, method: 'POST', body: { token: t._b.token, ...AT } })
    return x
  }
  r = await win(president, { checkInOpensAt: new Date(Date.now() + 3600e3).toISOString(), checkInClosesAt: new Date(Date.now() + 2 * 3600e3).toISOString() })
  check('President can set a window (200)', r._s === 200, `${r._s}`)
  r = await scanFor(staff, studentA)
  check('scan BEFORE the window opens is refused (403)', r._s === 403 && /not opened/.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
  r = await win(manager, { checkInOpensAt: new Date(Date.now() - 2 * 3600e3).toISOString(), checkInClosesAt: new Date(Date.now() - 3600e3).toISOString() })
  r = await scanFor(staff, studentA)
  check('scan AFTER the window closes is refused (403)', r._s === 403 && /closed/.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)
  r = await api('/api/attendance', { token: studentB.token, method: 'POST', body: { type: 'event', eventId: evW.id, userId: studentB.id, method: 'self', ...AT } })
  check('self check-in outside the window is refused (403)', r._s === 403, `${r._s}`)
  r = await api('/api/attendance', { token: staff.token, method: 'POST', body: { type: 'event', eventId: evW.id, userId: studentB.id, method: 'manual', manualReason: 'phone dead' } })
  check('staff manual override still works outside the window (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  r = await win(manager, { checkInOpensAt: new Date(Date.now() - 3600e3).toISOString(), checkInClosesAt: new Date(Date.now() + 3600e3).toISOString() })
  r = await scanFor(staff, studentA)
  check('scan INSIDE the window works (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  r = await win(manager, {})
  const row = await prisma.event.findUnique({ where: { id: evW.id } })
  check('clearing the window removes the limit', r._s === 200 && row!.checkInOpensAt === null && row!.checkInClosesAt === null, `${r._s}`)
}

async function cleanup() {
  console.log('\nCleaning up and restoring real settings...')
  for (const file of photoFiles) await rm(file, { force: true }).catch(() => {})
  for (const id of eventIds) {
    await prisma.attendance.deleteMany({ where: { eventId: id } })
    await prisma.event.delete({ where: { id } }).catch(() => {})
  }
  await prisma.semester.deleteMany({ where: { OR: [{ id: { in: semIds } }, { name: { contains: tag } }] } })
  if (original) {
    await prisma.settings.update({
      where: { id: original.id },
      data: { signatureRetentionSemesters: original.keep, purgeGraceDays: original.grace, lastPurgeAt: original.lastPurgeAt, lastPurgeCount: original.lastPurgeCount }
    })
  }
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { userId: { in: ids } },
        { performedBy: { in: ids } },
        { action: 'signatures_purged', createdAt: { gte: startedAt } },
        { action: 'attendance_photos_purged', createdAt: { gte: startedAt } },
        { details: { contains: tag } }
      ]
    }
  })
  for (const id of ids) {
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
