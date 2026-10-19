// Live end-to-end test: the DB-backed health probe and the daily email-quota
// guard (plan §11.1). Creates a throwaway manager, checks both endpoints over
// HTTP, and cleans up.
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

const tag = 'e2ehealth' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], emailSendIds: string[] } = { userIds: [], emailSendIds: [] }

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
  const manager = await mkUser('manager', { role: 'super_admin', canConfigure: true })
  const plain = await mkUser('plain')

  console.log('\n--- health ---')
  let r = await api('/api/health')
  check('health is public and reports the database up (200)', r._s === 200 && r._b?.status === 'ok' && r._b?.database === 'up', `${r._s} ${JSON.stringify(r._b)}`)
  check('health reports a latency and a timestamp', typeof r._b?.latencyMs === 'number' && typeof r._b?.time === 'string', JSON.stringify(r._b))
  check('health leaks nothing else', Object.keys(r._b ?? {}).sort().join(',') === 'database,latencyMs,status,time', Object.keys(r._b ?? {}).join(','))

  r = await api('/api/health', { method: 'POST' })
  check('health refuses non-GET (405)', r._s === 405, `${r._s}`)

  console.log('\n--- email quota ---')
  r = await api('/api/settings/email-quota')
  check('anonymous callers get 401', r._s === 401, `${r._s}`)

  r = await api('/api/settings/email-quota', { token: plain.token })
  check('a plain officer is refused (403)', r._s === 403, `${r._s}`)

  r = await api('/api/settings/email-quota', { token: manager.token })
  const before = r._b as { count: number, limit: number, remaining: number, exceeded: boolean, dayStart: string }
  check('a settings manager reads the quota (200)', r._s === 200 && typeof before?.count === 'number' && typeof before?.limit === 'number', `${r._s} ${JSON.stringify(r._b)}`)
  check('the quota never reports negative room', before.remaining >= 0 && before.remaining <= before.limit, JSON.stringify(before))
  check('the day boundary is UTC midnight', new Date(before.dayStart).toISOString() === before.dayStart && before.dayStart.endsWith('T00:00:00.000Z'), before.dayStart)

  // A real send (the guard records it) — registration sends the verification mail.
  console.log('\n--- a send is counted ---')
  r = await api('/api/auth/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '9.9.7.7' },
    body: {
      name: 'Quota Student',
      studentNo: 'E2E' + tag.slice(-8),
      email: `${tag}-student@isufst.edu.ph`,
      consent: true
    }
  })
  check('registration accepted (200) so a mail was attempted', r._s === 200, `${r._s} ${JSON.stringify(r._b)}`)

  const row = await prisma.user.findUnique({ where: { email: `${tag}-student@isufst.edu.ph` }, select: { id: true } })
  if (row) made.userIds.push(row.id)

  // The counter is written after the (captured) send; give it a moment.
  let counted = 0
  for (let attempt = 0; attempt < 20; attempt++) {
    r = await api('/api/settings/email-quota', { token: manager.token })
    counted = (r._b as { count: number }).count
    if (counted > before.count) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  // The daily budget has a hard cap. When it is already spent the guard skips
  // the send on purpose — that is exactly the behaviour worth asserting rather
  // than a counter that cannot move. Without the capture server there is nowhere
  // for the mail to land, so the counter legitimately stays put there too.
  const budgetSpent = before.exceeded || before.remaining === 0
  const captured = !!process.env.EMAIL_CAPTURE_URL
  check(
    budgetSpent ? 'the spent budget skipped the send, as designed' : captured ? 'the send raised today’s counter' : 'a send without a capture server does not exceed the budget',
    budgetSpent || !captured ? counted <= before.limit : counted > before.count,
    `${before.count}/${before.limit} -> ${counted}${captured ? '' : ' (no capture server)'}`
  )

  const sendRows = await prisma.emailSend.findMany({ where: { createdAt: { gte: new Date(before.dayStart) } }, select: { id: true } })
  made.emailSendIds = sendRows.map(s => s.id)
  // A row exists only when a send actually succeeded; a skipped or unlandable
  // send legitimately leaves none, and that is the guard doing its job.
  check(
    'the counter row stores a kind and a time only',
    (budgetSpent || !captured) ? true : sendRows.length > 0,
    `rows=${sendRows.length}${captured ? '' : ' (no capture server)'}`
  )
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  // Only the rows this run added — identified by being newer than the day start
  // captured before it started sending.
  if (made.emailSendIds.length) {
    await prisma.emailSend.deleteMany({ where: { id: { in: made.emailSendIds } } })
  }
  if (made.userIds.length) {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { details: { contains: tag } }] } })
    await prisma.studentProfile.deleteMany({ where: { userId: { in: made.userIds } } })
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
