// Live end-to-end test: event categories and the calendar/registration fields on
// events (plan §8.2). Creates throwaway categories + an event, exercises the
// reference and events APIs over HTTP, then deletes everything.
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

const tag = 'e2eevent' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], categoryIds: string[], eventIds: string[] } = { userIds: [], categoryIds: [], eventIds: [] }

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

const DATE = new Date(Date.now() + 3 * 86_400_000).toISOString()

async function main() {
  const manager = await mkUser('manager', { role: 'super_admin', canConfigure: true })
  const staff = await mkUser('staff', { role: 'staff' })
  const client = await mkUser('client')

  console.log('\n--- reading categories ---')
  let r = await api('/api/reference/categories')
  check('categories need a session (401)', r._s === 401, `${r._s}`)

  r = await api('/api/reference/categories', { token: client.token })
  const seeded = (r._b ?? []).map((c: { code: string }) => c.code)
  check('any officer can read them (200)', r._s === 200, `${r._s}`)
  check('the seeded categories are there', ['general-assembly', 'flag-ceremony', 'seminar', 'sports'].every(c => seeded.includes(c)), seeded.join(','))

  console.log('\n--- who may manage them ---')
  r = await api('/api/reference/categories', { method: 'POST', token: client.token, body: { code: 'nope', name: 'Nope' } })
  check('a plain client cannot create a category (403)', r._s === 403, `${r._s}`)

  console.log('\n--- managing them ---')
  const code = 'e2e-' + tag.slice(-6)
  r = await api('/api/reference/categories', { method: 'POST', token: manager.token, body: { code, name: 'E2E Seminar', color: '#1E4A9E', sortOrder: 9 } })
  check('a manager creates a category (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  if (r._s === 201) made.categoryIds.push(r._b.id)
  const categoryId = r._b?.id

  r = await api('/api/reference/categories', { method: 'POST', token: manager.token, body: { code, name: 'Duplicate' } })
  check('a duplicate code is refused (409)', r._s === 409, `${r._s}`)

  r = await api('/api/reference/categories', { method: 'POST', token: manager.token, body: { code: code + 'x', name: 'Bad colour', color: 'blue' } })
  check('an invalid colour is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- events carry the calendar/registration fields ---')
  r = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} event`, date: DATE, lat: 10.72, lng: 122.56, radiusMeters: 50, categoryId, capacity: 40, registrationRequired: true }
  })
  check('an event is created with the new fields (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  if (r._s === 201) made.eventIds.push(r._b.id)
  const eventId = r._b?.id
  check('the response carries the category', r._b?.category?.code === code && r._b?.capacity === 40 && r._b?.registrationRequired === true, JSON.stringify({ category: r._b?.category, capacity: r._b?.capacity, reg: r._b?.registrationRequired }))

  r = await api('/api/events', { method: 'POST', token: staff.token, body: { title: `${tag} bad`, date: DATE, lat: 10.72, lng: 122.56, categoryId: '00000000-0000-0000-0000-000000000000' } })
  check('an unknown category is refused (404)', r._s === 404, `${r._s}`)

  r = await api('/api/events', { method: 'POST', token: staff.token, body: { title: `${tag} bad capacity`, date: DATE, lat: 10.72, lng: 122.56, capacity: 0 } })
  check('a nonsense capacity is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- listing and filtering ---')
  r = await api('/api/events', { token: staff.token, query: { categoryId } })
  check('events filter by category', r._s === 200 && (r._b ?? []).length === 1 && r._b[0].id === eventId, `${r._s} ${(r._b ?? []).length}`)

  const from = new Date(Date.now() - 86_400_000).toISOString()
  const to = new Date(Date.now() + 7 * 86_400_000).toISOString()
  r = await api('/api/events', { token: staff.token, query: { from, to } })
  check('events filter by date range too', r._s === 200 && (r._b ?? []).some((e: { id: string }) => e.id === eventId), `${(r._b ?? []).length}`)

  r = await api('/api/events', { token: staff.token, query: { from: to, to: from } })
  check('an empty range returns nothing', r._s === 200 && !(r._b ?? []).some((e: { id: string }) => e.id === eventId), `${(r._b ?? []).length}`)

  console.log('\n--- updating an event ---')
  r = await api(`/api/events/${eventId}`, { method: 'PUT', token: staff.token, body: { capacity: 25, categoryId: null } })
  check('clearing the category and changing capacity works (200)', r._s === 200 && r._b?.category === null && r._b?.capacity === 25, `${r._s} ${JSON.stringify({ category: r._b?.category, capacity: r._b?.capacity })}`)

  console.log('\n--- archiving protects referenced categories ---')
  r = await api(`/api/events/${eventId}`, { method: 'PUT', token: staff.token, body: { categoryId } })
  check('the category can be set again (200)', r._s === 200 && r._b?.category?.id === categoryId, `${r._s}`)

  r = await api('/api/reference/categories', { method: 'DELETE', token: manager.token, body: { id: categoryId } })
  check('a referenced category cannot be deleted (409)', r._s === 409, `${r._s}`)

  r = await api('/api/reference/categories', { method: 'PATCH', token: manager.token, body: { id: categoryId, archived: true } })
  check('it can be archived instead (200)', r._s === 200 && r._b?.archived === true, `${r._s}`)

  r = await api('/api/reference/categories', { token: manager.token })
  check('archived categories leave the list', !(r._b ?? []).some((c: { id: string }) => c.id === categoryId), 'still listed')

  r = await api('/api/events', { method: 'POST', token: staff.token, body: { title: `${tag} archived cat`, date: DATE, lat: 10.72, lng: 122.56, categoryId } })
  check('no new event may use an archived category (400)', r._s === 400, `${r._s}`)

  console.log('\n--- audit trail ---')
  const audits = await prisma.auditLog.findMany({ where: { performedBy: manager.id }, orderBy: { createdAt: 'desc' }, take: 10 })
  const actions = new Set(audits.map(a => a.action))
  check('category writes are audited', actions.has('event_category_added') && actions.has('event_category_updated'), [...actions].join(','))
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
  for (const id of made.categoryIds) {
    await prisma.auditLog.deleteMany({ where: { details: { contains: id } } })
    await prisma.eventCategory.delete({ where: { id } }).catch(() => {})
  }
  await prisma.eventCategory.deleteMany({ where: { code: { startsWith: 'e2e-' } } }).catch(() => {})
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
