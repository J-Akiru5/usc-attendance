// Live end-to-end test: the required audience (plan §8.2). It is the shared
// concept behind analytics' "expected" and P4's absence fines, so this suite
// proves both halves: the audience resolves to the right students, and the
// dashboard's expected number follows it. Throwaway data, deleted afterwards.
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

const tag = 'e2eauth' + Date.now()
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

const DATE = new Date(Date.now() + 3 * 86_400_000).toISOString()

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const delegate = await mkUser('delegate')
  const student = await mkUser('student', { role: 'student' })

  // Real reference data: a college, and a section that belongs to it.
  const academic = await api('/api/reference/academic')
  const colleges = (academic._b?.colleges ?? []) as Array<{ id: string, code: string, name: string }>
  const programs = (academic._b?.programs ?? []) as Array<{ id: string, collegeId: string }>
  const sections = (academic._b?.sections ?? []) as Array<{ id: string, name: string, programId: string, yearLevel: number }>
  check('the reference data is available (200)', academic._s === 200 && colleges.length > 0, `${academic._s} colleges=${colleges.length}`)

  const collegeA = colleges[0]!
  const programA = programs.find(p => p.collegeId === collegeA.id)
  const sectionA = sections.find(s => s.programId === programA?.id)

  // Two students inside the audience, one outside, one unplaced.
  const insideA = await mkUser('insidea', { role: 'student' })
  const insideB = await mkUser('insideb', { role: 'student' })
  const outside = await mkUser('outside', { role: 'student' })
  const unplaced = await mkUser('unplaced', { role: 'student' })
  const placement = async (user: { id: string }, extra: Record<string, unknown>, index: number) => {
    await prisma.studentProfile.create({ data: { userId: user.id, studentNo: `${tag.slice(-7)}${index}`, ...extra } })
  }
  await placement(insideA, { collegeId: collegeA.id, yearLevel: 2, sectionId: sectionA?.id ?? null }, 1)
  await placement(insideB, { collegeId: collegeA.id, yearLevel: 3, sectionId: null }, 2)
  await placement(outside, { collegeId: colleges[1]?.id ?? null, yearLevel: 2 }, 3)
  await placement(unplaced, {}, 4)

  const collegeCount = await prisma.user.count({ where: { active: true, role: 'student', studentProfile: { is: { collegeId: collegeA.id } } } })
  const yearCount = await prisma.user.count({ where: { active: true, role: 'student', studentProfile: { is: { yearLevel: 2 } } } })

  console.log('\n--- creating events with an audience ---')
  let r = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} college assembly`, date: DATE, lat: 10.72, lng: 122.56, audienceType: 'college', audienceCollegeId: collegeA.id }
  })
  const collegeEventId = r._b?.id
  if (r._s === 201) made.eventIds.push(collegeEventId)
  check('a college audience is stored (201)', r._s === 201 && r._b?.audienceType === 'college' && r._b?.audienceCollegeId === collegeA.id, `${r._s} ${JSON.stringify({ type: r._b?.audienceType, college: r._b?.audienceCollegeId })}`)

  r = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} year assembly`, date: DATE, lat: 10.72, lng: 122.56, audienceType: 'yearLevel', audienceYearLevel: 2 }
  })
  const yearEventId = r._b?.id
  if (r._s === 201) made.eventIds.push(yearEventId)
  check('a year-level audience is stored (201)', r._s === 201 && r._b?.audienceType === 'yearLevel' && r._b?.audienceYearLevel === 2, `${r._s}`)

  console.log('\n--- the payloads it refuses ---')
  const bad = [
    { label: 'a college audience without a college (400)', body: { audienceType: 'college' }, status: 400 },
    { label: 'an unknown college (404)', body: { audienceType: 'college', audienceCollegeId: '00000000-0000-0000-0000-000000000000' }, status: 404 },
    { label: 'a year audience without a year (400)', body: { audienceType: 'yearLevel' }, status: 400 },
    { label: 'a nonsense year (400)', body: { audienceType: 'yearLevel', audienceYearLevel: 9 }, status: 400 },
    { label: 'an unknown section (404)', body: { audienceType: 'section', audienceSectionId: '00000000-0000-0000-0000-000000000000' }, status: 404 },
    { label: 'an invented audience type (400)', body: { audienceType: 'everyone-in-uniform' }, status: 400 }
  ]
  for (const scenario of bad) {
    const attempt = await api('/api/events', {
      method: 'POST',
      token: staff.token,
      body: { title: `${tag} rejected`, date: DATE, lat: 10.72, lng: 122.56, ...scenario.body }
    })
    check(scenario.label, attempt._s === scenario.status, `${attempt._s} ${JSON.stringify(attempt._b)}`)
  }

  console.log('\n--- who is actually expected ---')
  r = await api(`/api/events/${collegeEventId}/audience`, { token: staff.token })
  check('the college audience resolves to its students', r._s === 200 && r._b?.count === collegeCount, `${r._s} count=${r._b?.count} expected=${collegeCount}`)
  const audienceIds = (r._b?.students ?? []).map((s: { id: string }) => s.id)
  check('it contains the seeded students of that college', audienceIds.includes(insideA.id) && audienceIds.includes(insideB.id), audienceIds.slice(0, 6).join(','))
  check('and nobody from elsewhere or unplaced', !audienceIds.includes(outside.id) && !audienceIds.includes(unplaced.id), audienceIds.slice(0, 6).join(','))
  check('it says who it is for', /Everyone in/.test(r._b?.description ?? ''), r._b?.description)

  r = await api(`/api/events/${yearEventId}/audience`, { token: staff.token })
  check('the year audience matches its year', r._s === 200 && r._b?.count === yearCount, `${r._s} count=${r._b?.count} expected=${yearCount}`)
  const yearIds = (r._b?.students ?? []).map((s: { id: string }) => s.id)
  check('the year list holds both year-2 students', yearIds.includes(insideA.id) && yearIds.includes(outside.id) && !yearIds.includes(insideB.id), yearIds.slice(0, 6).join(','))

  console.log('\n--- analytics reads the same audience ---')
  r = await api('/api/analytics/events', { token: staff.token })
  const collegeRow = (r._b?.events ?? []).find((e: { id: string }) => e.id === collegeEventId)
  const yearRow = (r._b?.events ?? []).find((e: { id: string }) => e.id === yearEventId)
  check('the dashboard expects the college audience', r._s === 200 && collegeRow?.expected === collegeCount, `${collegeRow?.expected} vs ${collegeCount}`)
  check('and the year audience', yearRow?.expected === yearCount, `${yearRow?.expected} vs ${yearCount}`)

  await api(`/api/events/${yearEventId}`, { method: 'PUT', token: staff.token, body: { registrationRequired: true } })
  await api(`/api/events/${yearEventId}/registration`, { method: 'POST', token: insideA.token })
  r = await api(`/api/analytics/overview`, { token: staff.token, query: { eventId: yearEventId } })
  check('registration still wins for events that require it', r._s === 200 && r._b?.expected === 1, `${r._b?.expected}`)

  console.log('\n--- editing the audience ---')
  r = await api(`/api/events/${collegeEventId}`, { method: 'PUT', token: staff.token, body: { audienceType: 'yearLevel', audienceYearLevel: 2 } })
  check('switching to a year clears the college', r._s === 200 && r._b?.audienceType === 'yearLevel' && r._b?.audienceCollegeId === null, `${r._s} ${JSON.stringify({ type: r._b?.audienceType, college: r._b?.audienceCollegeId })}`)

  r = await api(`/api/events/${collegeEventId}`, { method: 'PUT', token: staff.token, body: { audienceType: 'all' } })
  check('switching back to everyone clears everything', r._s === 200 && r._b?.audienceType === 'all' && r._b?.audienceYearLevel === null, `${r._s}`)

  r = await api(`/api/events/${collegeEventId}`, { method: 'PUT', token: staff.token, body: { audienceType: 'college', audienceCollegeId: collegeA.id, title: `${tag} college assembly` } })
  check('and the college can be set again', r._s === 200 && r._b?.audienceCollegeId === collegeA.id, `${r._s}`)

  console.log('\n--- referencing it protects the college ---')
  const manager = await mkUser('manager', { role: 'super_admin', canConfigure: true })
  r = await api('/api/reference/colleges', { method: 'DELETE', token: manager.token, body: { id: collegeA.id } })
  check('a college an event expects cannot be deleted (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- who may read the audience ---')
  r = await api(`/api/events/${collegeEventId}/audience`, { token: student.token })
  check('a student cannot (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/events/${collegeEventId}/audience`, { token: delegate.token })
  check('nor a delegate without a grant (403)', r._s === 403, `${r._s}`)

  const grant = await prisma.eventDelegate.create({
    data: { eventId: collegeEventId, userId: delegate.id, scopes: ['view_roster'], grantedBy: staff.id, expiresAt: new Date(Date.now() + 86_400_000) }
  })
  made.delegateIds.push(grant.id)
  r = await api(`/api/events/${collegeEventId}/audience`, { token: delegate.token })
  check('a view_roster delegate can (200)', r._s === 200 && r._b?.count === collegeCount, `${r._s} ${r._b?.count}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.eventIds.length) {
    await prisma.eventRegistration.deleteMany({ where: { eventId: { in: made.eventIds } } })
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
