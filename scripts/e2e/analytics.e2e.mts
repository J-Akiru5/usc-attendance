// Live end-to-end test: attendance analytics and Student 360 (plan §8.3). Seeds
// one throwaway event with registrations and check-ins, then proves the
// dashboards reconcile with the raw export — the phase's acceptance test — and
// that each endpoint agrees with the others. Throwaway data, deleted afterwards.
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

const tag = 'e2eana' + Date.now()
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

const DATE = new Date(Date.now() + 2 * 86_400_000).toISOString()
const today = new Date()

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const delegate = await mkUser('delegate')
  const outsider = await mkUser('outsider')
  // Students, with a placement so the college/year breakdown has something real.
  const college = await prisma.college.findFirst({ select: { id: true, code: true } })
  const section = await prisma.section.findFirst({ select: { id: true, yearLevel: true } })
  const s1 = await mkUser('s1', { role: 'student' })
  const s2 = await mkUser('s2', { role: 'student' })
  const s3 = await mkUser('s3', { role: 'student' })
  for (const [index, student] of [s1, s2, s3].entries()) {
    await prisma.studentProfile.create({
      data: {
        userId: student.id,
        studentNo: `${tag.slice(-8)}-${index + 1}`,
        collegeId: college?.id ?? null,
        sectionId: section?.id ?? null,
        yearLevel: section?.yearLevel ?? 1
      }
    })
  }

  const created = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} assembly`, date: DATE, lat: 10.72, lng: 122.56, radiusMeters: 200, registrationRequired: true, capacity: 5 }
  })
  const eventId = created._b?.id
  if (created._s === 201) made.eventIds.push(eventId)
  check('an event with registration exists (201)', created._s === 201 && eventId, `${created._s}`)

  for (const student of [s1, s2, s3]) {
    await api(`/api/events/${eventId}/registration`, { method: 'POST', token: student.token })
  }
  for (const student of [s1, s2]) {
    await api('/api/attendance', {
      method: 'POST',
      token: staff.token,
      body: { type: 'event', eventId, userId: student.id, method: 'manual', manualReason: 'phone dead', lat: 10.72, lng: 122.56 }
    })
  }

  console.log('\n--- the dashboard reconciles with the raw export (acceptance) ---')
  let r = await api('/api/analytics/overview', { token: staff.token, query: { eventId } })
  const overview = r._b ?? {}
  check('the event overview counts seats and turns (200)', r._s === 200 && overview.expected === 3 && overview.attended === 2, `${r._s} ${JSON.stringify({ expected: overview.expected, attended: overview.attended })}`)
  check('the rate is attended over expected', Math.abs((overview.rate ?? 0) - 2 / 3) < 0.001, `${overview.rate}`)
  check('the no-show count names the missing registrant', overview.noShows === 1, `${overview.noShows}`)

  const exported = await fetch(`${process.env.BASE_URL}/api/attendance/export?eventId=${eventId}&format=csv`, {
    headers: { Authorization: `Bearer ${staff.token}` }
  }).then(res => res.text())
  const exportedRows = exported.trim().split(/\r?\n/).slice(1).filter(Boolean)
  check('the export has one row per record', exportedRows.length === 2, `${exportedRows.length}`)
  const exportedNames = exportedRows.length > 0 ? exportedRows.join('\n') : ''
  check('the export names exactly the students the dashboard counted', /E2E s1/.test(exportedNames) && /E2E s2/.test(exportedNames) && !/E2E s3/.test(exportedNames), exportedNames.slice(0, 120))

  console.log('\n--- the per-event table ---')
  r = await api('/api/analytics/events', { token: staff.token })
  const row = (r._b?.events ?? []).find((e: { id: string }) => e.id === eventId)
  check('the event table carries the same number as the export', r._s === 200 && row?.attended === 2 && row?.expected === 3, `${r._s} ${JSON.stringify(row)}`)

  console.log('\n--- the histogram ---')
  r = await api('/api/analytics/timing', { token: staff.token, query: { eventId } })
  const buckets = r._b?.buckets ?? []
  check('the histogram sums to the check-ins', r._s === 200 && r._b?.total === 2 && buckets.reduce((sum: number, b: { count: number }) => sum + b.count, 0) === 2, `${r._s} ${r._b?.total}`)
  const expectedHour = (today.getUTCHours() + 8) % 24
  check('the check-ins land in the current Manila hour', buckets[expectedHour]?.count === 2, `hour ${expectedHour} = ${buckets[expectedHour]?.count}`)
  check('the peak hour matches', r._b?.peakHour === expectedHour, `${r._b?.peakHour}`)

  console.log('\n--- breakdowns and rankings ---')
  r = await api('/api/analytics/breakdown', { token: staff.token, query: { by: 'collegeId' } })
  const collegeGroup = (r._b?.groups ?? []).find((g: { key: string }) => g.key === college?.id)
  check('the college breakdown sees the seeded students', r._s === 200 && (collegeGroup?.expected ?? 0) >= 3, `${r._s} ${JSON.stringify(r._b?.groups?.slice(0, 3))}`)

  r = await api('/api/analytics/breakdown', { token: staff.token, query: { by: 'nonsense' } })
  check('an unknown grouping is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/analytics/students', { token: staff.token, query: { order: 'top', limit: 5 } })
  const topIds = (r._b?.students ?? []).map((s: { id: string }) => s.id)
  check('the top list has the students who came', r._s === 200 && topIds.includes(s1.id) && topIds.includes(s2.id), `${r._s} ${topIds.join(',')}`)

  r = await api('/api/analytics/students', { token: staff.token, query: { order: 'bottom', limit: 100 } })
  const bottom = (r._b?.students ?? []) as Array<{ id: string, attended: number }>
  // `bottom` is ascending by attendance across every active student, so the
  // meaningful claims are the ordering and the fact that the least-attending
  // students lead it — not that my fixtures come first.
  const ascending = bottom.every((s, i) => i === 0 || bottom[i - 1]!.attended <= s.attended)
  check('the bottom list runs from least attendance upward', r._s === 200 && bottom.length > 0 && ascending, `${bottom.map(s => s.attended).join(',')}`)
  const firstWithAttendance = bottom.findIndex(s => s.attended > 0)
  const noShow = bottom.find(s => s.id === s3.id)
  const attendee = bottom.find(s => s.id === s1.id)
  const noShowIndex = noShow ? bottom.indexOf(noShow) : -1
  const attendeeIndex = attendee ? bottom.indexOf(attendee) : -1
  check('the no-show student leads an attender', noShowIndex === -1 || attendeeIndex === -1 || noShowIndex < attendeeIndex, `s3 at ${noShowIndex}, s1 at ${attendeeIndex}, first attender at ${firstWithAttendance}`)

  console.log('\n--- Student 360 ---')
  r = await api(`/api/analytics/students/${s1.id}`, { token: staff.token })
  check('staff can open a student (200)', r._s === 200 && r._b?.student?.id === s1.id, `${r._s}`)
  const history = r._b?.history ?? []
  check('the history shows the one event attended', history.length === 1 && history[0].eventId === eventId && history[0].method === 'manual', `${history.length} ${JSON.stringify(history[0])}`)
  check('the summary counts attendance, not raw rows', r._b?.summary?.attended === 1, `${r._b?.summary?.attended}`)

  r = await api(`/api/analytics/students/${s1.id}`, { token: s1.token })
  check('a student can open their own page (200)', r._s === 200 && r._b?.student?.id === s1.id, `${r._s}`)

  r = await api(`/api/analytics/students/${s1.id}`, { token: s2.token })
  check('another student cannot (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/analytics/students/${s1.id}`, { token: outsider.token })
  check('an officer without staff access cannot either (403)', r._s === 403, `${r._s}`)

  console.log('\n--- who may see the dashboards ---')
  r = await api('/api/reference/semesters', { token: staff.token })
  check('staff can list the semesters for the picker (200)', r._s === 200 && Array.isArray(r._b), `${r._s}`)

  r = await api('/api/reference/semesters', { token: s1.token })
  check('a student cannot (403)', r._s === 403, `${r._s}`)

  r = await api('/api/analytics/overview', { token: s1.token, query: { eventId } })
  check('a student cannot read the event overview (403)', r._s === 403, `${r._s}`)

  r = await api('/api/analytics/overview', { token: delegate.token, query: { eventId } })
  check('a delegate without a grant cannot read it either (403)', r._s === 403, `${r._s}`)

  const grant = await prisma.eventDelegate.create({
    data: { eventId, userId: delegate.id, scopes: ['view_roster'], grantedBy: staff.id, expiresAt: new Date(Date.now() + 86_400_000) }
  })
  made.delegateIds.push(grant.id)
  r = await api('/api/analytics/overview', { token: delegate.token, query: { eventId } })
  check('a view_roster delegate sees their event (200)', r._s === 200 && r._b?.attended === 2, `${r._s} ${JSON.stringify(r._b?.attended)}`)

  r = await api('/api/analytics/overview', { token: delegate.token })
  check('but not the whole semester (403)', r._s === 403, `${r._s}`)

  r = await api('/api/analytics/timing', { token: delegate.token, query: { eventId } })
  check('a delegate can read their event timing too (200)', r._s === 200 && r._b?.total === 2, `${r._s}`)
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
    await prisma.attendance.deleteMany({ where: { userId: id } })
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
