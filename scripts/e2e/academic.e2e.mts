// Live end-to-end test: creates throwaway academic reference rows (college →
// program → section) plus a throwaway student in the connected DB, exercises the
// reference APIs over HTTP (public tree, manager-only CRUD, validation, archive,
// delete-blocked-while-referenced) and a registration carrying a placement, then
// deletes everything.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { api } from './client.mts'

// Secrets the dev server needs: the runner's values win (`||=` never overwrites).
process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2eacad' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], collegeId?: string, programId?: string, sectionId?: string, studentNo?: string } = { userIds: [] }

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
  const manager = await mkUser('manager', { role: 'super_admin' })
  const plain = await mkUser('plain')

  console.log('\n--- public tree ---')
  let r = await api('/api/reference/academic')
  const seeded = (r._b?.colleges ?? []).map((c: { code: string }) => c.code)
  check('public tree is readable without a token (200)', r._s === 200, `${r._s}`)
  check('seeded colleges are present (CICI, CoAg, CBMSD, CoEd)', ['CICI', 'CoAg', 'CBMSD', 'CoEd'].every(c => seeded.includes(c)), seeded.join(','))

  console.log('\n--- only settings managers may change reference data ---')
  r = await api('/api/reference/colleges', { method: 'POST', token: plain.token, body: { code: 'NOPE', name: 'Nope College' } })
  check('plain staff cannot create a college (403)', r._s === 403, `${r._s}`)
  r = await api('/api/reference/programs', { method: 'POST', token: plain.token, body: { collegeId: 'x', code: 'NOPE', name: 'Nope Program' } })
  check('plain staff cannot create a program (403)', r._s === 403, `${r._s}`)
  r = await api('/api/reference/sections', { method: 'DELETE', token: plain.token, body: { id: 'x' } })
  check('plain staff cannot delete a section (403)', r._s === 403, `${r._s}`)

  console.log('\n--- manager CRUD ---')
  const collegeCode = 'E2E' + tag.slice(-4).toUpperCase()
  r = await api('/api/reference/colleges', { method: 'POST', token: manager.token, body: { code: collegeCode, name: 'E2E College ' + tag } })
  check('college created (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  made.collegeId = r._b?.id

  r = await api('/api/reference/colleges', { method: 'POST', token: manager.token, body: { code: collegeCode, name: 'Duplicate College' } })
  check('duplicate college code refused (409)', r._s === 409, `${r._s}`)

  r = await api('/api/reference/colleges', { method: 'POST', token: manager.token, body: { code: 'bad code', name: 'Bad College' } })
  check('invalid college code refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/reference/programs', { method: 'POST', token: manager.token, body: { collegeId: made.collegeId, code: 'E2EP1', name: 'E2E Program One', yearLevels: 5 } })
  check('program created with 5 year levels (201)', r._s === 201 && r._b?.yearLevels === 5, `${r._s}`)
  made.programId = r._b?.id

  r = await api('/api/reference/programs', { method: 'POST', token: manager.token, body: { collegeId: '00000000-0000-0000-0000-000000000000', code: 'E2EP2', name: 'E2E Program Two' } })
  check('program under an unknown college refused (404)', r._s === 404, `${r._s}`)

  r = await api('/api/reference/sections', { method: 'POST', token: manager.token, body: { programId: made.programId, yearLevel: 6, name: 'E2E-6A' } })
  check('year level above the program length refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/reference/sections', { method: 'POST', token: manager.token, body: { programId: made.programId, yearLevel: 2, name: 'E2E-2A' } })
  check('section created (201)', r._s === 201, `${r._s}`)
  made.sectionId = r._b?.id

  r = await api('/api/reference/academic')
  const treeCollege = (r._b?.colleges ?? []).find((c: { id: string }) => c.id === made.collegeId)
  const treeProgram = treeCollege?.programs?.find((p: { id: string }) => p.id === made.programId)
  const treeSection = treeProgram?.sections?.find((s: { id: string }) => s.id === made.sectionId)
  check('tree nests program under college and section under program', !!treeProgram && !!treeSection && treeSection.yearLevel === 2, JSON.stringify(treeSection))

  console.log('\n--- registration with a placement ---')
  const studentNo = 'E2E' + tag.slice(-8)
  const studentEmail = `${tag}-student@isufst.edu.ph`
  r = await api('/api/auth/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '9.9.4.4' },
    body: {
      name: 'Test Student',
      studentNo,
      email: studentEmail,
      password: 'Str0ngPassw0rd!',
      consent: true,
      collegeId: made.collegeId,
      programId: made.programId,
      yearLevel: 2,
      sectionId: made.sectionId
    }
  })
  check('registration with a placement accepted (200)', r._s === 200, `${r._s} ${JSON.stringify(r._b)}`)

  const profile = await prisma.studentProfile.findUnique({ where: { studentNo }, include: { user: true } })
  if (profile) {
    made.userIds.push(profile.userId)
    made.studentNo = studentNo
  }
  const placementDetail = profile
    ? JSON.stringify({
        collegeId: profile.collegeId,
        programId: profile.programId,
        yearLevel: profile.yearLevel,
        program: profile.program
      })
    : 'no profile row'
  check(
    'profile stored the placement (college/program/year + program name)',
    !!profile
    && profile.collegeId === made.collegeId
    && profile.programId === made.programId
    && profile.yearLevel === 2
    && profile.program === 'E2E Program One',
    placementDetail
  )

  console.log('\n--- mismatched placement is refused ---')
  r = await api('/api/auth/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '9.9.4.5' },
    body: {
      name: 'Test Student Two',
      studentNo: studentNo + 'B',
      email: `${tag}-student2@isufst.edu.ph`,
      password: 'Str0ngPassw0rd!',
      consent: true,
      collegeId: made.collegeId,
      programId: made.programId,
      yearLevel: 3,
      sectionId: made.sectionId
    }
  })
  check('section for a different year level refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- archive hides rows from the tree, delete is blocked while referenced ---')
  r = await api('/api/reference/programs', { method: 'DELETE', token: manager.token, body: { id: made.programId } })
  check('program with students cannot be deleted (409)', r._s === 409, `${r._s}`)
  r = await api('/api/reference/colleges', { method: 'DELETE', token: manager.token, body: { id: made.collegeId } })
  check('college with programs cannot be deleted (409)', r._s === 409, `${r._s}`)
  r = await api('/api/reference/programs', { method: 'PATCH', token: manager.token, body: { id: made.programId, yearLevels: 1 } })
  check('shrinking year levels below an enrolled student refused (409)', r._s === 409, `${r._s}`)
  r = await api('/api/reference/sections', { method: 'PATCH', token: manager.token, body: { id: made.sectionId, archived: true } })
  check('section archived (200)', r._s === 200 && r._b?.archived === true, `${r._s}`)
  r = await api('/api/reference/academic')
  const archivedHidden = !JSON.stringify(r._b).includes(made.sectionId!)
  check('archived section hidden from the public tree', archivedHidden, 'still listed')
  r = await api('/api/reference/sections', { method: 'PATCH', token: manager.token, body: { id: made.sectionId, archived: false } })
  check('section restored (200)', r._s === 200 && r._b?.archived === false, `${r._s}`)

  console.log('\n--- audit trail ---')
  const audit = await prisma.auditLog.findMany({ where: { performedBy: { in: [manager.id] } }, orderBy: { createdAt: 'desc' }, take: 20 })
  const kinds = new Set(audit.map(a => a.action))
  check('reference writes are audited', ['college_added', 'program_added', 'section_added'].every(k => kinds.has(k)), [...kinds].join(','))
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  const ids = [made.collegeId, made.programId, made.sectionId].filter(Boolean) as string[]
  if (ids.length) {
    await prisma.auditLog.deleteMany({ where: { OR: ids.map(id => ({ details: { contains: id } })) } })
  }
  await prisma.auditLog.deleteMany({ where: { performedBy: { in: made.userIds } } })
  await prisma.studentProfile.deleteMany({ where: { userId: { in: made.userIds } } })
  if (made.sectionId) await prisma.section.delete({ where: { id: made.sectionId } }).catch(() => {})
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
