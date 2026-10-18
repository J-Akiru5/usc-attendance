// Live end-to-end test: the notification core (plan §8.4) — registration news,
// waitlist promotion, the reminder cron and per-user channel preferences. The
// local email capture server is what makes the channel choices provable: with
// email off nothing arrives in the inbox, with email on but in-app off the mail
// still goes and the inbox stays clean. Throwaway data, deleted afterwards.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { api, capturedEmails, clearCapturedEmails } from './client.mts'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2enotif' + Date.now()
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
  return { id: data.user.id, email, token: s.session.access_token }
}

async function mkEvent(title: string, when: Date, token: string, body: Record<string, unknown> = {}) {
  const r = await api('/api/events', {
    method: 'POST',
    token,
    body: { title, date: when.toISOString(), lat: 10.72, lng: 122.56, radiusMeters: 200, ...body }
  })
  if (r._s === 201) made.eventIds.push(r._b.id)
  return r
}

async function inbox(token: string, query = '') {
  return api(`/api/notifications${query}`, { token })
}

const hoursOut = (hours: number) => new Date(Date.now() + hours * 3600_000)
const notesFor = async (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const a = await mkUser('a', { role: 'student' })
  const b = await mkUser('b', { role: 'student' })
  const c = await mkUser('c', { role: 'student' })

  console.log('\n--- registering tells the student where they stand ---')
  await clearCapturedEmails()
  const capped = await mkEvent(`${tag} assembly`, hoursOut(5), staff.token, { registrationRequired: true, capacity: 1 })
  const eventId = capped._b?.id
  check('a registration event exists (201)', capped._s === 201 && eventId, `${capped._s}`)

  let r = await api(`/api/events/${eventId}/registration`, { method: 'POST', token: a.token })
  check('the first student takes the seat (201)', r._s === 201, `${r._s}`)

  r = await inbox(a.token)
  check('their inbox carries a registration confirmation (200)', r._s === 200 && (r._b?.notifications ?? []).some((n: { kind: string }) => n.kind === 'registration_confirmed'), `${r._s} ${JSON.stringify(r._b?.notifications?.map((n: { kind: string }) => n.kind))}`)
  check('and it is counted as unread', r._b?.unread === 1, `${r._b?.unread}`)

  let emails = await capturedEmails()
  const confirmationMails = emails.filter(m => m.to === a.email)
  check('the confirmation also went out by email', confirmationMails.length === 1, `${confirmationMails.length}`)

  r = await api(`/api/events/${eventId}/registration`, { method: 'POST', token: b.token })
  check('the second student joins the waitlist (201)', r._s === 201 && r._b?.status === 'waitlisted', `${r._s}`)
  r = await inbox(b.token)
  const waitlistNote = (r._b?.notifications ?? []).find((n: { kind: string }) => n.kind === 'waitlist_joined')
  check('they are told they are in line', !!waitlistNote && /waitlist/i.test(waitlistNote.title), `${JSON.stringify(waitlistNote?.title)}`)

  console.log('\n--- a freed seat promotes and tells the next in line ---')
  r = await api(`/api/events/${eventId}/registration`, { method: 'DELETE', token: a.token })
  check('the seat is given up and b promoted', r._s === 200 && r._b?.promoted === true, `${r._s}`)

  r = await inbox(b.token)
  const promoted = (r._b?.notifications ?? []).find((n: { kind: string }) => n.kind === 'waitlist_promoted')
  check('the promoted student is notified', !!promoted, JSON.stringify(r._b?.notifications?.map((n: { kind: string }) => n.kind)))
  check('only once, however many times the event is edited', (await notesFor(b.id)).filter(n => n.kind === 'waitlist_promoted').length === 1)

  console.log('\n--- channel preferences mean what they say ---')
  r = await api('/api/notifications/preferences', { token: c.token })
  check('a user who never chose gets the defaults (200)', r._s === 200 && r._b?.preferences?.inApp === true && r._b?.preferences?.email === true && r._b?.preferences?.push === false, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/notifications/preferences', { method: 'PUT', token: c.token, body: { email: false } })
  check('email can be switched off (200)', r._s === 200 && r._b?.preferences?.email === false, `${r._s}`)

  await clearCapturedEmails()
  const cEvent = await mkEvent(`${tag} quiet`, hoursOut(6), staff.token, { registrationRequired: true, capacity: 5 })
  const cEventId = cEvent._b?.id
  await api(`/api/events/${cEventId}/registration`, { method: 'POST', token: c.token })
  emails = await capturedEmails()
  check('with email off, nothing is mailed', emails.filter(m => m.to === c.email).length === 0, `${emails.filter(m => m.to === c.email).length}`)
  r = await inbox(c.token)
  check('but the inbox still has it', (r._b?.notifications ?? []).some((n: { kind: string }) => n.kind === 'registration_confirmed'), `${JSON.stringify(r._b?.notifications?.length)}`)

  await api('/api/notifications/preferences', { method: 'PUT', token: c.token, body: { inApp: false, email: true } })
  await clearCapturedEmails()
  const cEvent2 = await mkEvent(`${tag} mail only`, hoursOut(7), staff.token, { registrationRequired: true, capacity: 5 })
  const cEvent2Id = cEvent2._b?.id
  await api(`/api/events/${cEvent2Id}/registration`, { method: 'POST', token: c.token })
  emails = await capturedEmails()
  check('with in-app off, the mail still goes', emails.filter(m => m.to === c.email).length === 1, `${emails.filter(m => m.to === c.email).length}`)
  r = await inbox(c.token)
  check('and the inbox stays clean', !(r._b?.notifications ?? []).some((n: { title: string }) => n.title.includes('mail only')), `${JSON.stringify(r._b?.notifications?.length)}`)
  const mailOnly = await prisma.notification.findFirst({ where: { userId: c.id, kind: 'registration_confirmed', channels: { has: 'email' } }, orderBy: { createdAt: 'desc' } })
  check('the record still says how it went out', !!mailOnly && !mailOnly.channels.includes('inApp'), JSON.stringify(mailOnly?.channels))

  console.log('\n--- reading the inbox ---')
  r = await api('/api/notifications/read', { method: 'POST', token: b.token, body: {} })
  check('an empty read request is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/notifications/read', { method: 'POST', token: b.token, body: { all: true } })
  check('marking everything read works (200)', r._s === 200 && (r._b?.updated ?? 0) >= 2, `${r._s} ${r._b?.updated}`)
  r = await inbox(b.token)
  check('the unread count is back to zero', r._b?.unread === 0, `${r._b?.unread}`)

  r = await api('/api/notifications/read', { method: 'POST', token: b.token, body: { ids: [mailOnly!.id] } })
  check('another person\'s notification is not touched', r._s === 200 && r._b?.updated === 0, `${r._s} ${r._b?.updated}`)

  console.log('\n--- the reminder cron ---')
  r = await api('/api/cron/event-reminders')
  check('the cron needs its secret (401)', r._s === 401, `${r._s}`)

  const secret = process.env.CRON_SECRET!
  const soon = await mkEvent(`${tag} tomorrow`, hoursOut(24), staff.token, { registrationRequired: true, capacity: 3 })
  const soonId = soon._b?.id
  await api(`/api/events/${soonId}/registration`, { method: 'POST', token: a.token })
  await api(`/api/events/${soonId}/registration`, { method: 'POST', token: b.token })

  r = await api('/api/cron/event-reminders', { headers: { Authorization: `Bearer ${secret}` } })
  check('the cron runs with the secret (200)', r._s === 200, `${r._s} ${JSON.stringify(r._b)}`)
  const day = (r._b?.windows ?? []).find((w: { eventId: string, window: string }) => w.eventId === soonId && w.window === '24h')
  check('the 24-hour window reaches both registrants', day?.sent === 2, JSON.stringify(day))

  const aNotes = (await notesFor(a.id)).filter(n => n.kind === 'event_reminder')
  check('the students can see the reminder', aNotes.length >= 1 && /tomorrow/i.test(aNotes[aNotes.length - 1]!.title), JSON.stringify(aNotes.map(n => n.title)))

  r = await api('/api/cron/event-reminders', { headers: { Authorization: `Bearer ${secret}` } })
  const again = (r._b?.windows ?? []).find((w: { eventId: string, window: string }) => w.eventId === soonId && w.window === '24h')
  check('running it again sends nothing extra', again?.sent === 0 && again?.duplicates === 2, JSON.stringify(again))

  const far = await mkEvent(`${tag} next week`, hoursOut(120), staff.token, { registrationRequired: true, capacity: 3 })
  await api(`/api/events/${far._b?.id}/registration`, { method: 'POST', token: a.token })
  r = await api('/api/cron/event-reminders', { headers: { Authorization: `Bearer ${secret}` } })
  check('an event five days out gets no reminder', !(r._b?.windows ?? []).some((w: { eventId: string }) => w.eventId === far._b?.id), JSON.stringify((r._b?.windows ?? []).map((w: { window: string }) => w.window)))

  const anHour = await mkEvent(`${tag} within the hour`, new Date(Date.now() + 3600_000), staff.token, { registrationRequired: true, capacity: 3 })
  await api(`/api/events/${anHour._b?.id}/registration`, { method: 'POST', token: a.token })
  r = await api('/api/cron/event-reminders', { headers: { Authorization: `Bearer ${secret}` } })
  const hourWindow = (r._b?.windows ?? []).find((w: { eventId: string, window: string }) => w.eventId === anHour._b?.id && w.window === '1h')
  check('the 1-hour window fires as the event nears', hourWindow?.sent === 1, JSON.stringify(hourWindow))
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.userIds.length) {
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { createdBy: { in: made.userIds } }] } })
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: made.userIds } } })
  }
  if (made.eventIds.length) {
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.attendance.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  }
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } })
  await prisma.notification.deleteMany({ where: { title: { contains: tag } } })
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
