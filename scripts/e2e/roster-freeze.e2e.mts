// Live end-to-end test: the expected roster is frozen at window close (benchmark
// BC-4). Proves the whole promise — the freeze happens when the window closes,
// the fine run (and the dashboard) reuse it after a student transfers college,
// the dashboard says "frozen at", and freezing twice is a no-op. Throwaway data,
// deleted afterwards.
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

const tag = 'e2efrz' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], eventIds: string[], collegeIds: string[] } = { userIds: [], eventIds: [], collegeIds: [] }

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

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const suffix = tag.slice(-7)
  const collegeA = await prisma.college.create({ data: { code: `E2EA${suffix}`, name: `${tag} College A` } })
  const collegeB = await prisma.college.create({ data: { code: `E2EB${suffix}`, name: `${tag} College B` } })
  made.collegeIds.push(collegeA.id, collegeB.id)

  // A (expected, never turns up), B (expected, on time), an outsider in another
  // college, and a joiner used later for the deliberate re-freeze.
  const a = await mkUser('a', { role: 'student' })
  const b = await mkUser('b', { role: 'student' })
  const outsider = await mkUser('outsider', { role: 'student' })
  const joiner = await mkUser('joiner', { role: 'student' })
  const profiles = [
    { user: a, collegeId: collegeA.id, studentNo: `${suffix}1` },
    { user: b, collegeId: collegeA.id, studentNo: `${suffix}2` },
    { user: outsider, collegeId: collegeB.id, studentNo: `${suffix}3` },
    { user: joiner, collegeId: collegeB.id, studentNo: `${suffix}4` }
  ]
  for (const profile of profiles) {
    await prisma.studentProfile.create({ data: { userId: profile.user.id, studentNo: profile.studentNo, collegeId: profile.collegeId, yearLevel: 2 } })
  }

  const opensAt = minutesAgo(120)
  const closesAt = minutesAgo(90)
  const created = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} assembly`,
      date: opensAt.toISOString(),
      lat: 10.72,
      lng: 122.56,
      radiusMeters: 200,
      audienceType: 'college',
      audienceCollegeId: collegeA.id
    }
  })
  const eventId = created._b?.id
  if (created._s === 201) made.eventIds.push(eventId)
  await prisma.event.update({ where: { id: eventId }, data: { checkInOpensAt: opensAt, checkInClosesAt: closesAt } })
  check('the closed event exists (201)', created._s === 201 && eventId, `${created._s}`)

  // B turns up five minutes after the window opens; A never does.
  await prisma.attendance.create({
    data: { type: 'event', eventId, userId: b.id, method: 'manual', lat: 10.72, lng: 122.56, recordedBy: staff.id, createdAt: new Date(opensAt.getTime() + 5 * 60_000) }
  })

  const expectedCount = await prisma.user.count({ where: { active: true, role: 'student', studentProfile: { is: { collegeId: collegeA.id } } } })
  const secret = process.env.CRON_SECRET!

  console.log('\n--- the window closes and freezes the roster ---')
  let r = await api('/api/cron/event-fines')
  check('the cron still needs its secret (401)', r._s === 401, `${r._s}`)

  r = await api('/api/cron/event-fines', { headers: { Authorization: `Bearer ${secret}` } })
  const firstRun = (r._b?.results ?? []).find((x: { eventId: string }) => x.eventId === eventId)
  check('the run that closes the window captures the live roster', firstRun?.roster === 'live' && firstRun?.audience === expectedCount, JSON.stringify(firstRun))

  const frozen = await prisma.eventExpected.findMany({ where: { eventId } })
  check('one row per expected person', frozen.length === expectedCount && expectedCount === 2, `${frozen.length} vs ${expectedCount}`)
  check('the rows say why and where at the time', frozen.every(row => row.source === 'college' && row.collegeId === collegeA.id), JSON.stringify(frozen.map(row => row.source)))
  check('the snapshot carries a freeze time', frozen.every(row => row.snapshotAt instanceof Date && !Number.isNaN(row.snapshotAt.getTime())), `${frozen[0]?.snapshotAt}`)
  check('someone outside the audience is not in it', !frozen.some(row => row.userId === outsider.id), frozen.map(row => row.userId).join(','))
  const firstFrozenAt = frozen[0]?.snapshotAt ?? null

  const fines = await prisma.fine.findMany({ where: { eventId } })
  const aFine = fines.find(fine => fine.userId === a.id)
  check('the absent expected student was charged', aFine !== undefined, JSON.stringify(fines.map(fine => fine.userId)))
  check('the student who came owes nothing', !fines.some(fine => fine.userId === b.id), JSON.stringify(fines.map(fine => fine.userId)))
  check('the outsider was not charged', !fines.some(fine => fine.userId === outsider.id), JSON.stringify(fines.map(fine => fine.userId)))

  console.log('\n--- the snapshot survives a transfer ---')
  await prisma.studentProfile.update({ where: { userId: a.id }, data: { collegeId: collegeB.id } })
  const liveAfterMove = await prisma.user.count({ where: { active: true, role: 'student', studentProfile: { is: { collegeId: collegeA.id } } } })
  check('the live audience is now one smaller', liveAfterMove === expectedCount - 1, `${liveAfterMove} vs ${expectedCount - 1}`)

  // Delete the fine and let the cron see the event again: if the run recomputed
  // the audience, A (now in college B) would silently lose the charge.
  await prisma.fine.delete({ where: { id: aFine!.id } })
  await prisma.event.update({ where: { id: eventId }, data: { finesIssuedAt: null } })

  r = await api('/api/cron/event-fines', { headers: { Authorization: `Bearer ${secret}` } })
  const secondRun = (r._b?.results ?? []).find((x: { eventId: string }) => x.eventId === eventId)
  check('the cron reuses the frozen roster instead of resolving live', secondRun?.roster === 'snapshot', JSON.stringify(secondRun))
  check('and still counts the person who transferred out', secondRun?.audience === expectedCount, `${secondRun?.audience} vs ${expectedCount}`)

  const afterMove = await prisma.eventExpected.findMany({ where: { eventId } })
  check('the snapshot did not follow the transfer', afterMove.length === expectedCount && afterMove.find(row => row.userId === a.id)?.collegeId === collegeA.id, `${afterMove.length}`)
  check('the transferred student still owes for the event', await prisma.fine.count({ where: { eventId, userId: a.id } }) === 1, `${await prisma.fine.count({ where: { eventId, userId: a.id } })}`)
  check('nobody new was charged', await prisma.fine.count({ where: { eventId } }) === fines.length, `${await prisma.fine.count({ where: { eventId } })}`)

  console.log('\n--- the dashboard says "frozen at" ---')
  r = await api('/api/analytics/events', { token: staff.token })
  const analyticsRow = (r._b?.events ?? []).find((x: { id: string }) => x.id === eventId)
  check('the per-event table keeps the frozen expected count', r._s === 200 && analyticsRow?.expected === expectedCount, `${r._s} ${JSON.stringify(analyticsRow)}`)
  check('and says when it was frozen', typeof analyticsRow?.frozenAt === 'string' && new Date(analyticsRow.frozenAt).getTime() === firstFrozenAt?.getTime(), `${analyticsRow?.frozenAt}`)

  r = await api('/api/analytics/overview', { token: staff.token, query: { eventId } })
  check('the overview reports the same freeze', r._s === 200 && r._b?.expected === expectedCount && r._b?.frozenEvents === 1, `${r._s} ${JSON.stringify({ expected: r._b?.expected, frozenEvents: r._b?.frozenEvents })}`)
  check('with the freeze time on the headline', typeof r._b?.frozenAt === 'string' && new Date(r._b.frozenAt).getTime() === firstFrozenAt?.getTime(), `${r._b?.frozenAt}`)
  check('no-shows are counted against the frozen roster', r._b?.noShows === 1, `${r._b?.noShows}`)

  r = await api(`/api/events/${eventId}/snapshot`, { token: staff.token })
  check('the event page can read the roster state', r._s === 200 && r._b?.frozen === true && r._b?.count === expectedCount && r._b?.due === true, `${r._s} ${JSON.stringify(r._b)}`)
  check('and the state names the same freeze time', new Date(r._b?.frozenAt).getTime() === firstFrozenAt?.getTime(), `${r._b?.frozenAt}`)

  console.log('\n--- freezing twice is idempotent ---')
  const auditsBefore = await prisma.auditLog.count({ where: { action: 'event_expected_frozen', details: { contains: eventId } } })

  r = await api(`/api/events/${eventId}/snapshot`, { method: 'POST', token: staff.token })
  check('a second freeze is a no-op (200)', r._s === 200 && r._b?.unchanged === true && r._b?.written === false, `${r._s} ${JSON.stringify(r._b)}`)
  check('the freeze time did not move', new Date(r._b?.frozenAt).getTime() === firstFrozenAt?.getTime(), `${r._b?.frozenAt}`)

  r = await api(`/api/events/${eventId}/snapshot`, { method: 'POST', token: staff.token, body: { refresh: true } })
  check('even a deliberate re-freeze writes nothing when nothing changed', r._s === 200 && r._b?.written === false && r._b?.unchanged === true, `${r._s} ${JSON.stringify(r._b)}`)
  check('and a no-op is not audited', await prisma.auditLog.count({ where: { action: 'event_expected_frozen', details: { contains: eventId } } }) === auditsBefore, `${await prisma.auditLog.count({ where: { action: 'event_expected_frozen', details: { contains: eventId } } })} vs ${auditsBefore}`)

  console.log('\n--- a deliberate re-freeze adopts the current audience ---')
  await prisma.studentProfile.update({ where: { userId: joiner.id }, data: { collegeId: collegeA.id } })
  r = await api(`/api/events/${eventId}/snapshot`, { method: 'POST', token: staff.token, body: { refresh: true } })
  check('the re-freeze writes the new population', r._s === 200 && r._b?.written === true && r._b?.created === 1 && r._b?.removed === 1, `${r._s} ${JSON.stringify(r._b)}`)
  check('the joiner is in and the transfer is out', r._b?.count === 2, `${r._b?.count}`)
  check('the re-freeze is audited', await prisma.auditLog.count({ where: { action: 'event_expected_frozen', details: { contains: eventId } } }) === auditsBefore + 1, `${await prisma.auditLog.count({ where: { action: 'event_expected_frozen', details: { contains: eventId } } })}`)
  check('the new rows carry the joiner and not the transfer', await prisma.eventExpected.count({ where: { eventId, userId: joiner.id } }) === 1 && await prisma.eventExpected.count({ where: { eventId, userId: a.id } }) === 0, 're-freeze rows')

  console.log('\n--- freezing early, and what cannot be frozen ---')
  const future = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} future`,
      date: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      lat: 10.72,
      lng: 122.56,
      audienceType: 'college',
      audienceCollegeId: collegeA.id
    }
  })
  const futureId = future._b?.id
  if (future._s === 201) made.eventIds.push(futureId)
  r = await api(`/api/events/${futureId}/snapshot`, { method: 'POST', token: staff.token })
  check('an event can be frozen early', r._s === 200 && r._b?.frozen === true && r._b?.count === 2 && r._b?.due === false, `${r._s} ${JSON.stringify(r._b)}`)

  const cancelled = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} cancelled`,
      date: minutesAgo(60).toISOString(),
      lat: 10.72,
      lng: 122.56,
      audienceType: 'college',
      audienceCollegeId: collegeA.id
    }
  })
  const cancelledId = cancelled._b?.id
  if (cancelled._s === 201) made.eventIds.push(cancelledId)
  await api(`/api/events/${cancelledId}/cancel`, { method: 'POST', token: staff.token, body: { reason: 'test fixture' } })
  r = await api(`/api/events/${cancelledId}/snapshot`, { method: 'POST', token: staff.token })
  check('a cancelled event has no expected roster (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- who may freeze or read it ---')
  r = await api(`/api/events/${eventId}/snapshot`, { method: 'POST', token: b.token })
  check('a student cannot freeze a roster (403)', r._s === 403, `${r._s}`)
  r = await api(`/api/events/${eventId}/snapshot`)
  check('an anonymous caller cannot either (401)', r._s === 401, `${r._s}`)
  r = await api(`/api/events/${eventId}/snapshot`, { token: b.token })
  check('nor read the roster state (403)', r._s === 403, `${r._s}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.eventIds.length) {
    await prisma.fine.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.attendance.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventExpected.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.fineRule.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  }
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } })
  // System audit rows (the automatic freeze) name the event but not a person.
  for (const eventId of made.eventIds) {
    await prisma.auditLog.deleteMany({ where: { details: { contains: eventId } } })
  }
  if (made.userIds.length) {
    await prisma.fine.deleteMany({ where: { userId: { in: made.userIds } } })
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { createdBy: { in: made.userIds } }] } })
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: made.userIds } } })
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { performedBy: { in: made.userIds } }] } })
  }
  for (const id of made.userIds) {
    await prisma.studentProfile.deleteMany({ where: { userId: id } })
    await prisma.user.delete({ where: { id } }).catch(() => {})
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
  for (const id of made.collegeIds) {
    await prisma.college.delete({ where: { id } }).catch(() => {})
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
