// Live end-to-end test: student-ID barcode scanning support (plan §8.2). Covers
// the scoped student lookup the scanner uses (student number or name, staff or a
// manual_checkin delegate, minimal fields) and the barcode check-in path through
// /api/attendance. Waitlists, QR tokens and the window rules are covered by the
// registrations / retention suites — this one is only about identifying a
// student by number off an ID. Throwaway data, deleted afterwards.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'crypto'
import { api } from './client.mts'
import { scanRateLimitConfig, scanWindowStart } from '../../server/utils/rate-limit'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2escan' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], eventIds: string[], delegateIds: string[] } = { userIds: [], eventIds: [], delegateIds: [] }

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

const DATE = new Date(Date.now() + 5 * 86_400_000).toISOString()
const NO_A = `${tag.slice(-6).toUpperCase()}-001`
const NO_B = `${tag.slice(-6).toUpperCase()}-002`

async function grant(eventId: string, userId: string, scopes: string[], grantedBy: string, extra: Record<string, unknown> = {}) {
  const row = await prisma.eventDelegate.create({
    data: { eventId, userId, scopes, grantedBy, expiresAt: new Date(Date.now() + 86_400_000), ...extra }
  })
  made.delegateIds.push(row.id)
  return row
}

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const delegate = await mkUser('delegate')
  const outsider = await mkUser('outsider')
  const studentA = await mkUser('studenta', { role: 'student', name: 'E2E Alpha One' })
  const studentB = await mkUser('studentb', { role: 'student', name: 'E2E Beta Two' })
  const raceStudent = await mkUser('racestudent', { role: 'student' })
  const throttleOfficer = await mkUser('throttleofficer', { role: 'staff' })
  const throttleStudent = await mkUser('throttlestudent', { role: 'student' })

  await prisma.studentProfile.create({ data: { userId: studentA.id, studentNo: NO_A, yearLevel: 2 } })
  await prisma.studentProfile.create({ data: { userId: studentB.id, studentNo: NO_B, yearLevel: 3 } })

  const created = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} assembly`, date: DATE, lat: 10.72, lng: 122.56, radiusMeters: 200 }
  })
  const eventId = created._b?.id
  if (created._s === 201) made.eventIds.push(eventId)
  check('an event exists to check into (201)', created._s === 201 && eventId, `${created._s}`)

  console.log('\n--- who may look a student up ---')
  let r = await api(`/api/events/${eventId}/student-lookup`, { query: { q: NO_A } })
  check('the lookup needs a session (401)', r._s === 401, `${r._s}`)

  r = await api(`/api/events/${eventId}/student-lookup`, { token: outsider.token, query: { q: NO_A } })
  check('an officer without a grant is refused (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/events/${eventId}/student-lookup`, { token: studentA.token, query: { q: NO_A } })
  check('a student is refused (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/events/${eventId}/student-lookup`, { token: staff.token, query: { q: NO_A } })
  const exactRow = (r._b?.students ?? [])[0]
  check('staff find the student by number (200)', r._s === 200 && r._b?.exact === studentA.id, `${r._s} ${JSON.stringify(r._b)}`)
  check('the answer stays minimal', JSON.stringify(Object.keys(exactRow ?? {}).sort()) === JSON.stringify(['id', 'name', 'section', 'studentNo', 'yearLevel']), Object.keys(exactRow ?? {}).join(','))

  await grant(eventId, delegate.id, ['manual_checkin'], staff.id)
  r = await api(`/api/events/${eventId}/student-lookup`, { token: delegate.token, query: { q: NO_A } })
  check('a manual_checkin delegate may look up (200)', r._s === 200 && r._b?.exact === studentA.id, `${r._s}`)

  const revoked = await mkUser('revoked')
  await grant(eventId, revoked.id, ['manual_checkin'], staff.id, { revokedAt: new Date() })
  r = await api(`/api/events/${eventId}/student-lookup`, { token: revoked.token, query: { q: NO_A } })
  check('a revoked grant does not (403)', r._s === 403, `${r._s}`)

  console.log('\n--- matching rules ---')
  r = await api(`/api/events/${eventId}/student-lookup`, { token: staff.token, query: { q: 'X' } })
  check('a one-character search is refused (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/events/${eventId}/student-lookup`, { token: staff.token, query: { q: 'Alpha One' } })
  check('a name finds the student (200)', r._s === 200 && (r._b?.students ?? []).some((s: { id: string }) => s.id === studentA.id), `${r._s} ${(r._b?.students ?? []).length}`)

  r = await api(`/api/events/${eventId}/student-lookup`, { token: staff.token, query: { q: NO_A.slice(0, -1) } })
  check('a shared prefix returns both, with no exact match', r._s === 200 && (r._b?.students ?? []).length === 2 && r._b?.exact === null, `${(r._b?.students ?? []).length} ${r._b?.exact}`)

  r = await api(`/api/events/${eventId}/student-lookup`, { token: staff.token, query: { q: 'NOT-A-NUMBER' } })
  check('an unknown number returns nothing', r._s === 200 && (r._b?.students ?? []).length === 0 && r._b?.exact === null, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- the barcode check-in ---')
  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: studentA.id, method: 'barcode', lat: 10.72, lng: 122.56, accuracy: 8 }
  })
  check('a barcode scan records attendance (201)', r._s === 201 && r._b?.user?.id === studentA.id, `${r._s} ${JSON.stringify(r._b)}`)
  const stored = await prisma.attendance.findFirst({ where: { eventId, userId: studentA.id }, select: { method: true } })
  check('it is stored as a barcode record', stored?.method === 'barcode', `${stored?.method}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: studentA.id, method: 'barcode', lat: 10.72, lng: 122.56 }
  })
  check('scanning the same student twice is refused (403)', r._s === 403, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- two simultaneous scans of one student ---')
  const raceBody = { type: 'event', eventId, userId: raceStudent.id, method: 'barcode', lat: 10.72, lng: 122.56, accuracy: 8 }
  const raced = await Promise.all([
    api('/api/attendance', { method: 'POST', token: staff.token, body: { ...raceBody, idempotencyKey: randomUUID() } }),
    api('/api/attendance', { method: 'POST', token: staff.token, body: { ...raceBody, idempotencyKey: randomUUID() } })
  ])
  const raceStatuses = raced.map(entry => entry._s).sort((a, b) => a - b)
  check('the race produces exactly one 201 and one 403', raceStatuses[0] === 201 && raceStatuses[1] === 403, JSON.stringify(raceStatuses))
  const openRaceRows = await prisma.attendance.count({ where: { eventId, userId: raceStudent.id, checkOutAt: null } })
  check('and exactly one open attendance row exists', openRaceRows === 1, `${openRaceRows}`)

  console.log('\n--- the scan budget is per officer, and a throttle is audited ---')
  const budget = scanRateLimitConfig()
  const windowStart = scanWindowStart(new Date(), budget.windowMs)
  // Seed the current window and the next one: a request that crosses the hour
  // boundary must still meet a spent budget rather than make this test flaky.
  for (const start of [windowStart, new Date(windowStart.getTime() + budget.windowMs)]) {
    await prisma.scanRateLimit.upsert({
      where: { officerId_windowStart: { officerId: throttleOfficer.id, windowStart: start } },
      create: { officerId: throttleOfficer.id, windowStart: start, count: budget.limit, updatedAt: new Date() },
      update: { count: budget.limit, throttledAt: null }
    })
  }
  r = await api('/api/attendance', {
    method: 'POST',
    token: throttleOfficer.token,
    body: { type: 'event', eventId, userId: throttleStudent.id, method: 'barcode', lat: 10.72, lng: 122.56, accuracy: 8 }
  })
  check('a caller above the scan budget gets 429', r._s === 429, `${r._s} ${JSON.stringify(r._b)}`)
  check('and is told when to retry', Number(r._h['retry-after'] ?? 0) > 0, `${r._h['retry-after']}`)
  const throttleAudit = await prisma.auditLog.findFirst({
    where: { action: 'attendance_scan_throttled', performedBy: throttleOfficer.id },
    orderBy: { createdAt: 'desc' }
  })
  check('the throttle is audited', !!throttleAudit, 'no audit row')
  const throttledRows = await prisma.attendance.count({ where: { eventId, userId: throttleStudent.id } })
  check('a throttled scan writes no attendance row', throttledRows === 0, `${throttledRows}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: throttleStudent.id, method: 'barcode', lat: 10.72, lng: 122.56, accuracy: 8 }
  })
  check('another officer keeps their own budget (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: studentB.id, method: 'magic', lat: 10.72, lng: 122.56 }
  })
  check('an invented method is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: studentB.token,
    body: { type: 'event', eventId, userId: studentA.id, method: 'barcode', lat: 10.72, lng: 122.56 }
  })
  check('a student cannot scan others in (403)', r._s === 403, `${r._s}`)

  console.log('\n--- the delegate at the door ---')
  r = await api('/api/attendance', {
    method: 'POST',
    token: delegate.token,
    body: { type: 'event', eventId, userId: studentB.id, method: 'barcode', lat: 10.72, lng: 122.56, accuracy: 8 }
  })
  check('a delegate at the venue records a scan (201)', r._s === 201 && r._b?.user?.id === studentB.id, `${r._s} ${JSON.stringify(r._b)}`)

  const studentC = await mkUser('studentc', { role: 'student' })
  await prisma.studentProfile.create({ data: { userId: studentC.id, studentNo: NO_A.replace('-001', '-003') } })
  r = await api('/api/attendance', {
    method: 'POST',
    token: delegate.token,
    body: { type: 'event', eventId, userId: studentC.id, method: 'barcode', lat: 11.5, lng: 123.9, accuracy: 8 }
  })
  check('far from the venue a delegate is refused', r._s === 400 || r._s === 403, `${r._s} ${JSON.stringify(r._b)}`)

  await prisma.event.update({ where: { id: eventId }, data: { checkInClosesAt: new Date(Date.now() - 3600_000) } })
  r = await api('/api/attendance', {
    method: 'POST',
    token: delegate.token,
    body: { type: 'event', eventId, userId: studentC.id, method: 'barcode', lat: 10.72, lng: 122.56, accuracy: 8 }
  })
  check('a closed window stops the delegate (403)', r._s === 403, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: studentC.id, method: 'barcode', lat: 10.72, lng: 122.56, accuracy: 8 }
  })
  check('staff may still record a late arrival (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.eventIds.length) {
    await prisma.attendance.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  }
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } })
  if (made.userIds.length) {
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
