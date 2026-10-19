// Live end-to-end test: event cancellation (benchmark BC-7). Until this existed
// a rained-out assembly would still send reminders and, once its window closed,
// fine everyone who stayed home. This proves a cancelled event is inert: no
// registration, no check-in, no reminders, no fines — and that the people who
// were expected are told. Throwaway data, deleted afterwards.
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

const tag = 'e2ecancel' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], eventIds: string[] } = { userIds: [], eventIds: [] }

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

const hoursOut = (hours: number) => new Date(Date.now() + hours * 3600_000)

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const student = await mkUser('student', { role: 'student' })
  const year = (Date.now() % 3) + 3
  await prisma.studentProfile.create({ data: { userId: student.id, studentNo: `${tag.slice(-7)}1`, yearLevel: year } })

  // One event inside the reminder window, with registrations, so cancellation
  // has something real to suppress on every path.
  const soon = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} assembly`,
      date: hoursOut(24).toISOString(),
      lat: 10.72,
      lng: 122.56,
      radiusMeters: 200,
      registrationRequired: true,
      capacity: 10,
      audienceType: 'yearLevel',
      audienceYearLevel: year
    }
  })
  const eventId = soon._b?.id
  if (soon._s === 201) made.eventIds.push(eventId)
  check('an event with registrations exists (201)', soon._s === 201 && eventId, `${soon._s}`)

  await api(`/api/events/${eventId}/registration`, { method: 'POST', token: student.token })
  const openWindow = await prisma.event.update({
    where: { id: eventId },
    data: { checkInOpensAt: new Date(Date.now() - 3600_000), checkInClosesAt: new Date(Date.now() + 3600_000) }
  })
  void openWindow

  console.log('\n--- who may cancel ---')
  let r = await api(`/api/events/${eventId}/cancel`, { method: 'POST', token: student.token, body: { reason: 'I feel like it' } })
  check('a student cannot cancel an event (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/events/${eventId}/cancel`, { method: 'GET', token: staff.token })
  check('the cancellation endpoint takes POST only (405)', r._s === 405, `${r._s}`)

  console.log('\n--- calling it off ---')
  r = await api(`/api/events/${eventId}/cancel`, { method: 'POST', token: staff.token, body: { reason: 'Typhoon signal 3' } })
  check('staff cancel the event (200)', r._s === 200 && r._b?.event?.status === 'cancelled', `${r._s} ${JSON.stringify(r._b?.event)}`)
  check('the reason is kept', r._b?.event?.cancelReason === 'Typhoon signal 3', `${r._b?.event?.cancelReason}`)
  check('the expected audience was told', (r._b?.notified ?? 0) >= 1, `${r._b?.notified}`)

  const noticeRow = await prisma.notification.findFirst({ where: { kind: 'event_cancelled' }, orderBy: { createdAt: 'desc' } })
  check('the notice says it was cancelled and what stops', !!noticeRow && /cancelled/i.test(noticeRow.body) && /no longer applies/i.test(noticeRow.body), noticeRow?.body?.slice(0, 80))

  r = await api(`/api/events/${eventId}/cancel`, { method: 'POST', token: staff.token, body: {} })
  check('cancelling twice is refused (409)', r._s === 409, `${r._s}`)

  const stored = await prisma.event.findUnique({ where: { id: eventId } })
  check('the row records who and when', stored?.status === 'cancelled' && !!stored.cancelledAt && stored.cancelledBy === staff.id, `${stored?.status} ${stored?.cancelledAt}`)

  console.log('\n--- a cancelled event is inert ---')
  r = await api(`/api/events/${eventId}/registration`, { method: 'POST', token: student.token })
  check('the waitlist cannot be joined (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: student.id, method: 'manual', manualReason: 'phone dead', lat: 10.72, lng: 122.56 }
  })
  check('nobody can be checked in (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)

  const secret = process.env.CRON_SECRET!
  r = await api('/api/cron/event-reminders', { headers: { Authorization: `Bearer ${secret}` } })
  const reminderRows = (r._b?.windows ?? []).filter((w: { eventId: string }) => w.eventId === eventId)
  check('the reminder cron skips it entirely', r._s === 200 && reminderRows.length === 0, JSON.stringify(reminderRows))
  check('and nobody received a reminder anyway', (await prisma.notification.count({ where: { kind: 'event_reminder', dedupeKey: { contains: eventId } } })) === 0, '')

  // Make it look already past, then run the fine generator: it must skip it.
  await prisma.event.update({ where: { id: eventId }, data: { date: new Date(Date.now() - 86_400_000), checkInClosesAt: new Date(Date.now() - 3600_000) } })
  r = await api('/api/cron/event-fines', { headers: { Authorization: `Bearer ${secret}` } })
  const fineRow = (r._b?.results ?? []).find((x: { eventId: string }) => x.eventId === eventId)
  check('the fine cron skips it too', r._s === 200 && !fineRow, JSON.stringify(fineRow))
  check('so nobody was fined for staying home', (await prisma.fine.count({ where: { eventId } })) === 0, `${await prisma.fine.count({ where: { eventId } })}`)

  r = await api(`/api/events/${eventId}`, { token: staff.token })
  check('the event page says it was cancelled, and by whom', r._s === 200 && r._b?.status === 'cancelled' && r._b?.canceller?.id === staff.id, `${r._s} ${r._b?.canceller?.name}`)

  console.log('\n--- an event that still happens is untouched ---')
  const live = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} live`, date: hoursOut(24).toISOString(), lat: 10.72, lng: 122.56, registrationRequired: true, capacity: 5, audienceType: 'yearLevel', audienceYearLevel: year }
  })
  const liveId = live._b?.id
  if (live._s === 201) made.eventIds.push(liveId)
  // The reminder window needs recipients: an event that takes registrations
  // reminds its registrants, so somebody has to register.
  await api(`/api/events/${liveId}/registration`, { method: 'POST', token: student.token })
  r = await api('/api/cron/event-reminders', { headers: { Authorization: `Bearer ${secret}` } })
  const liveRows = (r._b?.windows ?? []).filter((w: { eventId: string }) => w.eventId === liveId)
  check('a scheduled event still gets its reminder window', r._s === 200 && liveRows.length === 1, JSON.stringify(liveRows))
  check('the event defaults to scheduled', (await prisma.event.findUnique({ where: { id: liveId } }))?.status === 'scheduled', '')
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.eventIds.length) {
    await prisma.fine.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.attendance.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: { in: made.eventIds } } })
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
