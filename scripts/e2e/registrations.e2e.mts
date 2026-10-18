// Live end-to-end test: event registration and the waitlist (plan §8.2).
// Creates throwaway students/events over HTTP, drives a full capacity → queue →
// cancel → promotion cycle (including the back-of-the-queue rule), then deletes
// everything.
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

const tag = 'e2ereg' + Date.now()
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
    data: { id: data.user.id, email, name: `E2E ${key}`, position: 'Test', role: 'student', mustChangePassword: false, active: true, ...extra }
  })
  const { data: s, error: se } = await anon().auth.signInWithPassword({ email, password })
  if (se || !s.session) throw se
  made.userIds.push(data.user.id)
  return { id: data.user.id, token: s.session.access_token }
}

const DATE = new Date(Date.now() + 4 * 86_400_000).toISOString()

async function mkEvent(key: string, token: string, body: Record<string, unknown> = {}) {
  const r = await api('/api/events', {
    method: 'POST',
    token,
    body: { title: `${tag} ${key}`, date: DATE, lat: 10.72, lng: 122.56, radiusMeters: 50, ...body }
  })
  if (r._s === 201) made.eventIds.push(r._b.id)
  return r
}

async function main() {
  const manager = await mkUser('manager', { role: 'super_admin', canConfigure: true })
  const staff = await mkUser('staff', { role: 'staff' })
  const a = await mkUser('a')
  const b = await mkUser('b')
  const c = await mkUser('c')
  const d = await mkUser('d')

  const capped = await mkEvent('capped', staff.token, { capacity: 2, registrationRequired: true })
  const cappedId = capped._b?.id
  check('a registration event is created (201)', capped._s === 201 && cappedId, `${capped._s}`)

  console.log('\n--- guards ---')
  let r = await api(`/api/events/${cappedId}/registration`)
  check('registering needs a session (401)', r._s === 401, `${r._s}`)

  r = await api('/api/events/00000000-0000-0000-0000-000000000000/registration', { method: 'POST', token: a.token })
  check('an unknown event is 404', r._s === 404, `${r._s}`)

  r = await api(`/api/events/${cappedId}/registration`, { method: 'PATCH', token: a.token })
  check('an unsupported method is refused (405)', r._s === 405, `${r._s}`)

  console.log('\n--- filling the seats ---')
  r = await api(`/api/events/${cappedId}/registration`, { method: 'POST', token: a.token })
  check('the first student takes a seat (201, registered)', r._s === 201 && r._b?.status === 'registered' && r._b?.seatsLeft === 1, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/events/${cappedId}/registration`, { method: 'POST', token: b.token })
  check('the event fills up (201, seatsLeft 0)', r._s === 201 && r._b?.status === 'registered' && r._b?.seatsLeft === 0, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- the queue ---')
  r = await api(`/api/events/${cappedId}/registration`, { method: 'POST', token: c.token })
  check('the next student is waitlisted at position 1', r._s === 201 && r._b?.status === 'waitlisted' && r._b?.position === 1, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/events/${cappedId}/registration`, { method: 'POST', token: d.token })
  check('the queue keeps arrival order (position 2)', r._s === 201 && r._b?.status === 'waitlisted' && r._b?.position === 2, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/events/${cappedId}/registration`, { method: 'POST', token: a.token })
  const afterDouble = await prisma.eventRegistration.count({ where: { eventId: cappedId } })
  check('registering twice is harmless (still one row)', r._s === 201 && r._b?.status === 'registered' && afterDouble === 4, `${r._s} rows=${afterDouble}`)

  r = await api(`/api/events/${cappedId}/registration`, { token: a.token })
  check('a person can read their own stand (200)', r._s === 200 && r._b?.registration?.status === 'registered' && r._b?.seatsLeft === 0, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- the roster ---')
  r = await api(`/api/events/${cappedId}/registrations`, { token: a.token })
  check('a student cannot read the roster (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/events/${cappedId}/registrations`, { token: staff.token })
  const roster = r._b ?? {}
  check('staff see seats and queue (200)', r._s === 200 && roster.registered === 2 && roster.waitlisted === 2 && roster.seatsLeft === 0, `${r._s} ${JSON.stringify({ registered: roster.registered, waitlisted: roster.waitlisted })}`)
  check('the roster is oldest-first', (roster.registrations ?? []).map((row: { user: { id: string } }) => row.user.id).join(',') === [a.id, b.id, c.id, d.id].join(','), (roster.registrations ?? []).map((row: { user: { id: string } }) => row.user.id).join(','))

  const delegate = await prisma.eventDelegate.create({
    data: { eventId: cappedId, userId: a.id, scopes: ['view_roster'], grantedBy: manager.id, expiresAt: new Date(Date.now() + 86_400_000) }
  })
  made.delegateIds.push(delegate.id)
  r = await api(`/api/events/${cappedId}/registrations`, { token: a.token })
  check('a view_roster grant opens the roster (200)', r._s === 200, `${r._s}`)

  console.log('\n--- cancelling promotes the queue ---')
  r = await api(`/api/events/${cappedId}/registration`, { method: 'DELETE', token: a.token })
  check('giving up a seat promotes the longest waiter', r._s === 200 && r._b?.cancelled === true && r._b?.promoted === true && r._b?.seatsLeft === 0, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/events/${cappedId}/registration`, { token: c.token })
  check('the promoted student sees their seat', r._s === 200 && r._b?.registration?.status === 'registered' && r._b?.registration?.promotedAt, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/events/${cappedId}/registrations`, { token: staff.token })
  const promotedRow = (r._b?.registrations ?? []).find((row: { user: { id: string } }) => row.user.id === c.id)
  check('the roster shows the promotion', r._s === 200 && r._b?.registered === 2 && r._b?.waitlisted === 1 && promotedRow?.promotedAt, `${r._s} ${JSON.stringify({ registered: r._b?.registered, waitlisted: r._b?.waitlisted })}`)

  console.log('\n--- leaving the queue ---')
  r = await api(`/api/events/${cappedId}/registration`, { method: 'DELETE', token: d.token })
  check('leaving the waitlist promotes nobody', r._s === 200 && r._b?.cancelled === true && r._b?.promoted === false, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/events/${cappedId}/registration`, { method: 'DELETE', token: c.token })
  check('the last seat frees quietly with an empty queue', r._s === 200 && r._b?.promoted === false && r._b?.seatsLeft === 1, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/events/${cappedId}/registration`, { method: 'POST', token: a.token })
  check('someone who left can take a free seat again (201)', r._s === 201 && r._b?.status === 'registered', `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- rejoining goes to the back of the queue ---')
  const single = await mkEvent('single', staff.token, { capacity: 1, registrationRequired: true })
  const singleId = single._b?.id
  r = await api(`/api/events/${singleId}/registration`, { method: 'POST', token: a.token })
  check('a single-seat event takes one (201)', r._s === 201 && r._b?.status === 'registered', `${r._s}`)

  r = await api(`/api/events/${singleId}/registration`, { method: 'DELETE', token: a.token })
  check('it can be given up (nobody waiting)', r._s === 200 && r._b?.promoted === false, `${r._s}`)

  r = await api(`/api/events/${singleId}/registration`, { method: 'POST', token: b.token })
  check('the seat goes to the next person (201)', r._s === 201 && r._b?.status === 'registered', `${r._s}`)

  r = await api(`/api/events/${singleId}/registration`, { method: 'POST', token: c.token })
  const cPosition = r._b?.position
  r = await api(`/api/events/${singleId}/registration`, { method: 'POST', token: d.token })
  const dPosition = r._b?.position
  check('the queue forms in order', cPosition === 1 && dPosition === 2, `${cPosition}/${dPosition}`)

  // A's original row is the oldest of the four; if rejoining reused its timestamp
  // instead of the new one, A would jump to position 1 rather than the back.
  r = await api(`/api/events/${singleId}/registration`, { method: 'POST', token: a.token })
  check('rejoining takes the back of the queue (position 3)', r._s === 201 && r._b?.status === 'waitlisted' && r._b?.position === 3, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- my registrations ---')
  r = await api('/api/registrations/mine', { token: a.token })
  const mine = r._b ?? []
  const mineSingle = mine.find((row: { event: { id: string } }) => row.event.id === singleId)
  const mineCapped = mine.find((row: { event: { id: string } }) => row.event.id === cappedId)
  check('the list carries both stands (200)', r._s === 200 && mineCapped?.status === 'registered' && mineSingle?.status === 'waitlisted', `${r._s} ${JSON.stringify(mine.map((row: { status: string }) => row.status))}`)

  r = await api('/api/registrations/mine', { token: staff.token })
  check('someone with no registrations gets an empty list', r._s === 200 && Array.isArray(r._b) && r._b.length === 0, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- events that do not take registrations ---')
  const open = await mkEvent('open', staff.token, {})
  const openId = open._b?.id
  r = await api(`/api/events/${openId}/registration`, { method: 'POST', token: a.token })
  check('registration is refused (400)', r._s === 400, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/events/${openId}/registration`, { method: 'DELETE', token: a.token })
  check('cancelling without a registration is 404', r._s === 404, `${r._s}`)

  console.log('\n--- audit trail ---')
  const audits = await prisma.auditLog.findMany({ where: { performedBy: { in: made.userIds } } })
  const actions = new Set(audits.map(x => x.action))
  check('queue moves are audited', ['event_registration_created', 'event_registration_waitlisted', 'event_registration_cancelled'].every(x => actions.has(x)), [...actions].join(','))
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.eventIds.length) {
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.attendance.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  }
  await prisma.eventRegistration.deleteMany({ where: { userId: { in: made.userIds } } })
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } })
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
