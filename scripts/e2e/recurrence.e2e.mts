// Live end-to-end test: recurring events (plan §8.2, "create a recurring event →
// the calendar shows instances"). A series is materialised as real event rows so
// attendance and registration stay per occurrence; this suite drives creation,
// the calendar range, a rule change that must spare an instance holding
// attendance, clearing, and deletion. Throwaway data only, deleted afterwards.
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

const tag = 'e2erec' + Date.now()
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
    data: { id: data.user.id, email, name: `E2E ${key}`, position: 'Test', role: 'staff', mustChangePassword: false, active: true, ...extra }
  })
  const { data: s, error: se } = await anon().auth.signInWithPassword({ email, password })
  if (se || !s.session) throw se
  made.userIds.push(data.user.id)
  return { id: data.user.id, token: s.session.access_token }
}

// A Monday, so weekly arithmetic is easy to read.
const MONDAY = new Date('2027-03-01T01:00:00.000Z')
const iso = (d: Date) => d.toISOString()

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const student = await mkUser('student', { role: 'student' })

  console.log('\n--- creating a weekly series ---')
  let r = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} flag ceremony`,
      date: iso(MONDAY),
      lat: 10.72,
      lng: 122.56,
      radiusMeters: 50,
      capacity: 20,
      registrationRequired: true,
      rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4'
    }
  })
  check('a weekly series is created (201)', r._s === 201 && r._b?.occurrenceCount === 4, `${r._s} ${JSON.stringify(r._b?.occurrenceCount)}`)
  const masterId = r._b?.id
  if (r._s === 201) made.eventIds.push(masterId)
  check('the master carries the rule', r._b?.rrule === 'FREQ=WEEKLY;BYDAY=MO;COUNT=4' && r._b?.recurrenceIndex === 0, JSON.stringify({ rrule: r._b?.rrule, index: r._b?.recurrenceIndex }))

  r = await api(`/api/events/${masterId}`, { token: staff.token })
  check('the master counts its instances', r._s === 200 && r._b?._count?.occurrences === 3, `${r._s} ${JSON.stringify(r._b?._count)}`)

  console.log('\n--- the calendar shows the instances (acceptance) ---')
  const from = new Date('2027-02-28T00:00:00.000Z')
  const to = new Date('2027-04-01T00:00:00.000Z')
  r = await api('/api/events', { token: staff.token, query: { from: iso(from), to: iso(to) } })
  const series = (r._b ?? []).filter((e: { title: string }) => e.title === `${tag} flag ceremony`)
  check('four instances fall in the range', r._s === 200 && series.length === 4, `${series.length}`)
  const dates = series.map((e: { date: string }) => e.date.slice(0, 10)).sort()
  check('they land on consecutive Mondays', JSON.stringify(dates) === JSON.stringify(['2027-03-01', '2027-03-08', '2027-03-15', '2027-03-22']), dates.join(','))

  const child = series.find((e: { recurrenceIndex: number }) => e.recurrenceIndex === 3)
  check('instances point back at the master', series.every((e: { id: string, seriesId: string | null }) => e.seriesId === masterId || e.id === masterId), series.map((e: { seriesId: string | null }) => e.seriesId).join(','))

  r = await api(`/api/events/${child.id}`, { token: staff.token })
  check('an instance page shows the series', r._s === 200 && r._b?.series?.id === masterId && r._b?.series?._count?.occurrences === 3, `${r._s} ${JSON.stringify(r._b?.series?._count)}`)

  console.log('\n--- guards ---')
  r = await api('/api/events', {
    method: 'POST',
    token: student.token,
    body: { title: `${tag} nope`, date: iso(MONDAY), lat: 10.72, lng: 122.56, rrule: 'FREQ=WEEKLY;COUNT=3' }
  })
  check('a student cannot create a series (403)', r._s === 403, `${r._s}`)

  r = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} bad rule`, date: iso(MONDAY), lat: 10.72, lng: 122.56, rrule: 'FREQ=HOURLY' }
  })
  check('an unsupported rule is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} endless`, date: iso(MONDAY), lat: 10.72, lng: 122.56, rrule: 'FREQ=DAILY' }
  })
  check('an endless daily series is refused (400, cap)', r._s === 400, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- attendance makes an instance untouchable ---')
  const lastInstance = series.find((e: { recurrenceIndex: number }) => e.recurrenceIndex === 3)
  await prisma.attendance.create({
    data: { type: 'event', eventId: lastInstance.id, userId: student.id, method: 'manual', lat: 10.72, lng: 122.56, recordedBy: staff.id }
  })

  r = await api(`/api/events/${masterId}`, { method: 'PUT', token: staff.token, body: { rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2' } })
  const change = r._b?.seriesChange
  check('shrinking the rule removes only the blank instance', r._s === 200 && change?.removed === 1 && change?.locked === 1, `${r._s} ${JSON.stringify(change)}`)
  check('the master reports the new count', r._b?.occurrenceCount === 2, JSON.stringify(r._b?.occurrenceCount))

  const middle = series.find((e: { recurrenceIndex: number }) => e.recurrenceIndex === 2)
  r = await api(`/api/events/${middle.id}`, { token: staff.token })
  check('the dropped instance is gone (404)', r._s === 404, `${r._s}`)

  r = await api(`/api/events/${lastInstance.id}`, { token: staff.token })
  check('the instance holding attendance survives (200)', r._s === 200 && r._b?.id === lastInstance.id, `${r._s}`)

  r = await api(`/api/events/${masterId}`, { method: 'PUT', token: staff.token, body: { title: `${tag} renamed`, rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3' } })
  check('growing the rule adds the missing instance', r._s === 200 && r._b?.seriesChange?.created === 1, `${r._s} ${JSON.stringify(r._b?.seriesChange)}`)
  const renamed = await prisma.event.findMany({ where: { seriesId: masterId }, select: { title: true } })
  check('a rename follows the whole series', renamed.every(x => x.title === `${tag} renamed`), renamed.map(x => x.title).join(','))

  console.log('\n--- per-occurrence registration ---')
  r = await api(`/api/events/${lastInstance.id}/registration`, { method: 'POST', token: student.token })
  check('registration is per instance', r._s === 201 && r._b?.status === 'registered', `${r._s} ${JSON.stringify(r._b)}`)
  r = await api(`/api/events/${masterId}/registrations`, { token: staff.token })
  check('the other instances have no registrations', r._s === 200 && r._b?.registered === 0, `${r._s} ${JSON.stringify(r._b?.registered)}`)

  console.log('\n--- clearing and editing ---')
  r = await api(`/api/events/${masterId}`, { method: 'PUT', token: staff.token, body: { rrule: '' } })
  check('clearing the rule drops the whole series (200)', r._s === 200 && r._b?.occurrenceCount === 1 && r._b?.rrule === null, `${r._s} ${JSON.stringify({ count: r._b?.occurrenceCount, rrule: r._b?.rrule, change: r._b?.seriesChange })}`)

  r = await api(`/api/events/${lastInstance.id}`, { method: 'PUT', token: staff.token, body: { rrule: 'FREQ=WEEKLY;COUNT=3' } })
  check('an instance cannot sprout its own series (400)', r._s === 400, `${r._s}`)

  console.log('\n--- a monthly series walks over short months ---')
  r = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} monthly`, date: '2027-01-31T02:00:00.000Z', lat: 10.72, lng: 122.56, rrule: 'FREQ=MONTHLY;COUNT=3' }
  })
  check('a monthly series is created (201)', r._s === 201 && r._b?.occurrenceCount === 3, `${r._s}`)
  const monthlyId = r._b?.id
  if (r._s === 201) made.eventIds.push(monthlyId)

  const monthlyDates = (await prisma.event.findMany({ where: { OR: [{ id: monthlyId }, { seriesId: monthlyId }] }, select: { date: true } }))
    .map(x => x.date.toISOString().slice(0, 10)).sort()
  check('the 31st skips February and April', JSON.stringify(monthlyDates) === JSON.stringify(['2027-01-31', '2027-03-31', '2027-05-31']), monthlyDates.join(','))

  console.log('\n--- deleting ---')
  const doomed = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} doomed`, date: iso(MONDAY), lat: 10.72, lng: 122.56, rrule: 'FREQ=DAILY;COUNT=3' }
  })
  const doomedId = doomed._b?.id
  if (doomed._s === 201) made.eventIds.push(doomedId)
  r = await api(`/api/events/${doomedId}`, { method: 'DELETE', token: staff.token })
  check('deleting a clean series works (204)', r._s === 204, `${r._s}`)
  const leftovers = await prisma.event.count({ where: { seriesId: doomedId } })
  check('its instances go with it', leftovers === 0, `${leftovers}`)

  r = await api(`/api/events/${masterId}`, { method: 'DELETE', token: staff.token })
  check('a series with recorded attendance is protected (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- audit trail ---')
  const audits = await prisma.auditLog.findMany({ where: { performedBy: staff.id } })
  const actions = new Set(audits.map(a => a.action))
  check('series writes are audited', ['event_series_created', 'event_series_updated', 'event_deleted'].every(x => actions.has(x)), [...actions].join(','))
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  const titles = { startsWith: tag }
  const events = await prisma.event.findMany({ where: { title: titles }, select: { id: true } })
  const ids = events.map(e => e.id)
  if (ids.length) {
    await prisma.attendance.deleteMany({ where: { eventId: { in: ids } } })
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: ids } } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: { in: ids } } })
    await prisma.event.deleteMany({ where: { seriesId: { in: ids } } })
    await prisma.event.deleteMany({ where: { id: { in: ids } } })
  }
  if (made.userIds.length) {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { performedBy: { in: made.userIds } }] } })
  }
  for (const id of made.userIds) {
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
