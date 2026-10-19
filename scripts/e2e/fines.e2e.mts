// Live end-to-end test: absence fines (plan §8.5). Proves the acceptance path —
// an event closes, the right people are fined, nobody else is — plus the rule
// precedence, the idempotent cron and the student's own view. Throwaway data,
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

const tag = 'e2efine' + Date.now()
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

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const manager = await mkUser('manager', { role: 'super_admin', canConfigure: true })
  const year = 3 + (Date.now() % 3) // one of years 3–5, so the fixtures are unlikely to clash
  const a = await mkUser('a', { role: 'student' })
  const b = await mkUser('b', { role: 'student' })
  const c = await mkUser('c', { role: 'student' })
  const outsider = await mkUser('outsider', { role: 'student' })
  for (const [index, student] of [a, b, c].entries()) {
    await prisma.studentProfile.create({ data: { userId: student.id, studentNo: `${tag.slice(-7)}${index + 1}`, yearLevel: year } })
  }
  await prisma.studentProfile.create({ data: { userId: outsider.id, studentNo: `${tag.slice(-7)}9`, yearLevel: year === 3 ? 4 : 3 } })

  const secret = process.env.CRON_SECRET!
  const yearCount = await prisma.user.count({ where: { active: true, role: 'student', studentProfile: { is: { yearLevel: year } } } })

  console.log('\n--- the rules ---')
  let r = await api('/api/settings/fines', { token: staff.token })
  check('a plain officer cannot read the rates (403)', r._s === 403, `${r._s}`)

  r = await api('/api/settings/fines', { token: manager.token })
  check('a settings manager sees the defaults (200)', r._s === 200 && r._b?.global?.absentCentavos === 5000 && r._b?.global?.lateCentavos === 2500, `${r._s} ${JSON.stringify(r._b?.global)}`)

  r = await api('/api/settings/fines', { method: 'PUT', token: manager.token, body: { absentCentavos: 6000, lateCentavos: 3000, lateAfterMinutes: 15 } })
  check('the rates can be changed (200)', r._s === 200 && r._b?.rule?.absentCentavos === 6000, `${r._s} ${JSON.stringify(r._b?.rule)}`)

  r = await api('/api/settings/fines', { method: 'PUT', token: manager.token, body: { absentCentavos: -5 } })
  check('a nonsense rate is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- an event that has closed ---')
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
      audienceType: 'yearLevel',
      audienceYearLevel: year
    }
  })
  const eventId = created._b?.id
  if (created._s === 201) made.eventIds.push(eventId)
  await prisma.event.update({ where: { id: eventId }, data: { checkInOpensAt: opensAt, checkInClosesAt: closesAt } })
  check('the closed event exists (201)', created._s === 201 && eventId, `${created._s}`)

  // A on time, B late (20 min > the 15 min threshold), C never, and someone
  // outside the audience who came — nobody outside the audience is charged.
  const checkIn = async (userId: string, at: Date) => {
    await prisma.attendance.create({
      data: { type: 'event', eventId, userId, method: 'manual', lat: 10.72, lng: 122.56, recordedBy: staff.id, createdAt: at }
    })
  }
  await checkIn(a.id, new Date(opensAt.getTime() + 5 * 60_000))
  await checkIn(b.id, new Date(opensAt.getTime() + 20 * 60_000))
  await checkIn(outsider.id, new Date(opensAt.getTime() + 2 * 60_000))

  console.log('\n--- generation ---')
  r = await api('/api/cron/event-fines')
  check('the cron needs its secret (401)', r._s === 401, `${r._s}`)

  r = await api('/api/cron/event-fines', { headers: { Authorization: `Bearer ${secret}` } })
  check('the cron runs with the secret (200)', r._s === 200, `${r._s}`)
  const row = (r._b?.results ?? []).find((x: { eventId: string }) => x.eventId === eventId)
  check('it fined exactly the late student and the absentee', row?.late === 1 && row?.absent === 1, JSON.stringify(row))

  const fines = await prisma.fine.findMany({ where: { eventId }, include: { user: { select: { id: true } } } })
  const byUser = new Map(fines.map(f => [f.user.id, f]))
  check('A was on time and owes nothing', !byUser.has(a.id), `${fines.length}`)
  check('B owes the late rate (₱30)', byUser.get(b.id)?.kind === 'late' && byUser.get(b.id)?.amountCentavos === 3000, JSON.stringify(byUser.get(b.id)?.amountCentavos))
  check('C owes the absence rate (₱60)', byUser.get(c.id)?.kind === 'absent' && byUser.get(c.id)?.amountCentavos === 6000, JSON.stringify(byUser.get(c.id)?.amountCentavos))
  check('the outsider who came is not charged', !byUser.has(outsider.id), `${fines.length}`)
  check('the rule that produced it is snapshotted', JSON.stringify(byUser.get(c.id)?.ruleSnapshot ?? {}).includes('lateAfterMinutes'), JSON.stringify(byUser.get(c.id)?.ruleSnapshot))

  r = await api('/api/cron/event-fines', { headers: { Authorization: `Bearer ${secret}` } })
  check('running it again charges nobody twice', r._s === 200 && (r._b?.fines ?? -1) === 0, `${JSON.stringify(r._b?.fines)}`)
  check('and the rows are unchanged', (await prisma.fine.count({ where: { eventId } })) === 2, `${(await prisma.fine.count({ where: { eventId } }))}`)

  const bNotes = await prisma.notification.findMany({ where: { userId: b.id, kind: 'fine_issued' } })
  check('the fined student is told', bNotes.length === 1 && /late fine/i.test(bNotes[0]!.title), JSON.stringify(bNotes[0]?.title))

  console.log('\n--- the council sees it, the student sees their own ---')
  r = await api('/api/fines', { token: staff.token, query: { eventId } })
  check('staff can list the event\'s fines (200)', r._s === 200 && (r._b?.fines ?? []).length === 2, `${r._s} ${(r._b?.fines ?? []).length}`)
  check('with the unpaid total', r._b?.summary?.unpaidCentavos === 9000 && r._b?.summary?.unpaidPesos === '₱90.00', JSON.stringify(r._b?.summary))

  r = await api('/api/fines', { token: c.token })
  check('a student cannot list everyone\'s fines (403)', r._s === 403, `${r._s}`)

  r = await api('/api/fines/mine', { token: c.token })
  check('a student sees their own (200)', r._s === 200 && (r._b?.fines ?? []).length === 1 && r._b?.summary?.unpaidPesos === '₱60.00', `${r._s} ${JSON.stringify(r._b?.summary)}`)

  r = await api('/api/fines/mine', { token: a.token })
  check('the student who came owes nothing', r._s === 200 && r._b?.summary?.cleared === true, `${r._s} ${JSON.stringify(r._b?.summary)}`)

  r = await api(`/api/analytics/students/${c.id}`, { token: staff.token })
  check('Student 360 carries the fines and clearance', r._s === 200 && r._b?.finances?.unpaidCentavos === 6000 && r._b?.finances?.cleared === false, `${r._s} ${JSON.stringify(r._b?.finances)}`)

  r = await api(`/api/analytics/students/${c.id}`, { token: c.token })
  check('and the student can see their own', r._s === 200 && r._b?.finances?.unpaidCentavos === 6000, `${r._s}`)

  console.log('\n--- an event can override the rates ---')
  r = await api(`/api/events/${eventId}/fine-rule`, { method: 'PUT', token: staff.token, body: { absentCentavos: 1000, lateCentavos: 500, lateAfterMinutes: 15 } })
  check('an event rule can be set (200)', r._s === 200 && r._b?.rule?.absentCentavos === 1000, `${r._s} ${JSON.stringify(r._b?.rule)}`)

  const second = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} second`, date: minutesAgo(200).toISOString(), lat: 10.72, lng: 122.56, audienceType: 'yearLevel', audienceYearLevel: year }
  })
  const secondId = second._b?.id
  if (second._s === 201) made.eventIds.push(secondId)
  await prisma.event.update({ where: { id: secondId }, data: { checkInOpensAt: minutesAgo(200), checkInClosesAt: minutesAgo(170) } })
  await api(`/api/events/${secondId}/fine-rule`, { method: 'PUT', token: staff.token, body: { absentCentavos: 1000, lateCentavos: 500, lateAfterMinutes: 15 } })

  r = await api('/api/cron/event-fines', { headers: { Authorization: `Bearer ${secret}` } })
  const secondFines = await prisma.fine.findMany({ where: { eventId: secondId } })
  check('the event override wins over the global rule', secondFines.length === yearCount && secondFines.every(f => f.amountCentavos === 1000), `${secondFines.length} vs ${yearCount} · ${[...new Set(secondFines.map(f => f.amountCentavos))].join(',')}`)
  check('the cron counted the second event too', (r._b?.results ?? []).some((x: { eventId: string }) => x.eventId === secondId), JSON.stringify((r._b?.results ?? []).map((x: { eventId: string }) => x.eventId)))

  r = await api(`/api/events/${secondId}/fine-rule`, { method: 'DELETE', token: staff.token })
  check('the override can be cleared (204)', r._s === 204, `${r._s}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.eventIds.length) {
    await prisma.fine.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.attendance.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.fineRule.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  }
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } })
  if (made.userIds.length) {
    // Undo the rate change so the dev environment is as we found it.
    await prisma.fineRule.deleteMany({ where: { scope: 'global' } })
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
}

main()
  .catch((e) => { fail++; console.error('E2E error:', e) })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail ? 1 : 0)
  })
