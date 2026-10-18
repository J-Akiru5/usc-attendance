// Live end-to-end test: server-side table queries (paging, sorting, filtering)
// and saved views (plan §8.1, useDataTable). Creates throwaway students and a
// throwaway super admin, exercises /api/students and /api/views over HTTP, then
// deletes everything.
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

const tag = 'e2etable' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], collegeId?: string, programId?: string, viewIds: string[] } = { userIds: [], viewIds: [] }

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

async function main() {
  const superA = await mkUser('super', { role: 'super_admin' })
  const other = await mkUser('other', { role: 'super_admin' })
  const superToken = superA.token

  // Reference rows + three throwaway students whose names sort predictably.
  const college = await prisma.college.create({ data: { code: 'E2ET' + tag.slice(-3).toUpperCase(), name: `E2E Table College ${tag}` } })
  made.collegeId = college.id
  const program = await prisma.program.create({ data: { collegeId: college.id, code: 'E2EP', name: 'E2E Table Program', yearLevels: 4 } })
  made.programId = program.id

  const names = ['Anton Table', 'Bianca Table', 'Celso Table']
  for (const [index, name] of names.entries()) {
    const student = await mkUser(`student${index}`, { role: 'student' })
    // mkUser gives them placeholder names; use names that sort predictably.
    await prisma.user.update({ where: { id: student.id }, data: { name } })
    await prisma.studentProfile.create({
      data: {
        userId: student.id,
        studentNo: `${tag.slice(-6)}${index}`.toUpperCase(),
        program: 'E2E Table Program',
        collegeId: college.id,
        programId: program.id,
        yearLevel: index + 1
      }
    })
  }

  console.log('\n--- server-side paging ---')
  let r = await api('/api/students', { token: superToken, query: { pageSize: 2, sort: 'name', dir: 'asc' } })
  check('a page returns the asked-for size', r._s === 200 && (r._b?.students ?? []).length === 2, `${r._s} rows=${(r._b?.students ?? []).length}`)
  check('the total counts every match, not just the page', typeof r._b?.total === 'number' && r._b.total >= 3, `total=${r._b?.total}`)
  const firstPageNames = (r._b?.students ?? []).map((s: { name: string }) => s.name)

  r = await api('/api/students', { token: superToken, query: { pageSize: 2, page: 2, sort: 'name', dir: 'asc' } })
  const secondPageNames = (r._b?.students ?? []).map((s: { name: string }) => s.name)
  check('page 2 continues where page 1 stopped', firstPageNames.every((n: string) => !secondPageNames.includes(n)) && secondPageNames.length > 0, JSON.stringify([firstPageNames, secondPageNames]))
  check('names come back in ascending order', firstPageNames[0] === 'Anton Table', JSON.stringify(firstPageNames))

  console.log('\n--- sorting ---')
  r = await api('/api/students', { token: superToken, query: { sort: 'name', dir: 'desc', pageSize: 100 } })
  const descNames = (r._b?.students ?? []).map((s: { name: string }) => s.name)
  const antonAt = descNames.indexOf('Anton Table')
  const celsoAt = descNames.indexOf('Celso Table')
  check('descending really reverses', celsoAt !== -1 && antonAt !== -1 && celsoAt < antonAt, JSON.stringify(descNames.slice(0, 4)))

  r = await api('/api/students', { token: superToken, query: { sort: 'yearLevel', dir: 'desc', pageSize: 100 } })
  const years = (r._b?.students ?? []).map((s: { studentProfile?: { yearLevel?: number } }) => s.studentProfile?.yearLevel ?? 0)
  const sortedYears = [...years].sort((a: number, b: number) => b - a)
  check('sorting by the profile relation works', JSON.stringify(years) === JSON.stringify(sortedYears), JSON.stringify(years))

  r = await api('/api/students', { token: superToken, query: { sort: 'password' } })
  check('an unknown sort column is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/students', { token: superToken, query: { pageSize: 1000 } })
  check('page size is clamped to 100', r._b?.pageSize === 100, `${r._b?.pageSize}`)

  console.log('\n--- filtering ---')
  r = await api('/api/students', { token: superToken, query: { collegeId: college.id, pageSize: 100 } })
  check('filtering by college returns that college only', r._s === 200 && (r._b?.students ?? []).length === 3, `rows=${(r._b?.students ?? []).length}`)

  r = await api('/api/students', { token: superToken, query: { collegeId: college.id, yearLevel: 2, pageSize: 100 } })
  check('year level filter narrows further', (r._b?.students ?? []).length === 1 && r._b.students[0].name === 'Bianca Table', JSON.stringify((r._b?.students ?? []).map((s: { name: string }) => s.name)))

  r = await api('/api/students', { token: superToken, query: { q: 'Celso', pageSize: 100 } })
  check('free-text search still works', (r._b?.students ?? []).length === 1 && r._b.students[0].name === 'Celso Table', `${r._b?.total}`)

  r = await api('/api/students', { token: superToken, query: { active: 'false', collegeId: college.id, pageSize: 100 } })
  check('status filter works', (r._b?.students ?? []).length === 0, `rows=${(r._b?.students ?? []).length}`)

  console.log('\n--- saved views ---')
  r = await api('/api/views', { method: 'POST', token: superToken, body: { resource: 'students', name: 'My e2e view', query: 'pageSize=10&sort=name&dir=desc&collegeId=' + college.id } })
  check('a view is created (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  if (r._s === 201) made.viewIds.push(r._b.id)

  r = await api('/api/views', { method: 'POST', token: superToken, body: { resource: 'students', name: 'My e2e view', query: 'q=x' } })
  check('a duplicate name is refused (409)', r._s === 409, `${r._s}`)

  r = await api('/api/views', { token: superToken, query: { resource: 'students' } })
  const mine = r._b as Array<{ id: string, name: string, query: string }>
  check('the view is listed with its query string', mine.some(v => v.name === 'My e2e view' && v.query.includes('sort=name')), JSON.stringify(mine))

  r = await api('/api/views', { token: other.token, query: { resource: 'students' } })
  check('another officer does not see it', (r._b ?? []).length === 0, JSON.stringify(r._b))

  r = await api('/api/views', { method: 'DELETE', token: other.token, body: { id: made.viewIds[0] } })
  check('another officer cannot delete it (404)', r._s === 404, `${r._s}`)

  r = await api('/api/views', { method: 'PATCH', token: superToken, body: { id: made.viewIds[0], query: 'sort=email' } })
  check('overwriting a view stores the new query', r._s === 200 && String(r._b?.query).includes('sort=email'), `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/views', { method: 'POST', token: superToken, body: { resource: 'not a resource', name: 'x', query: '' } })
  check('an invalid resource name is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/views', { method: 'DELETE', token: superToken, body: { id: made.viewIds[0] } })
  check('the owner can delete it', r._s === 200 && r._b?.deleted === true, `${r._s}`)
  made.viewIds = []

  r = await api('/api/views', { token: superToken, query: { resource: 'students' } })
  check('the list is empty again', (r._b ?? []).length === 0, JSON.stringify(r._b))
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.viewIds.length) {
    await prisma.savedView.deleteMany({ where: { id: { in: made.viewIds } } })
  }
  await prisma.savedView.deleteMany({ where: { resource: 'students', user: { email: { endsWith: '@example.invalid' } } } })
  if (made.userIds.length) {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { performedBy: { in: made.userIds } }, { details: { contains: tag } }] } })
    await prisma.studentProfile.deleteMany({ where: { userId: { in: made.userIds } } })
  }
  if (made.programId) await prisma.program.delete({ where: { id: made.programId } }).catch(() => {})
  if (made.collegeId) await prisma.college.delete({ where: { id: made.collegeId } }).catch(() => {})
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
