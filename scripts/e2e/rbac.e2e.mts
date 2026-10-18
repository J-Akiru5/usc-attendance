// Live end-to-end test: creates throwaway officers of each access shape in the
// connected DB and proves the capability-based RBAC (plan §7.2) behaves exactly
// like the role + flag model it replaced: who may create events, change
// settings, grant delegation, and how assigning a role mirrors the legacy flags.
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

const tag = 'e2erbac' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], eventId?: string } = { userIds: [] }

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

async function main() {
  // A throwaway super admin rather than the real `admin@usc.edu.ph` account:
  // the suite must not depend on a password that the pre-work checklist says
  // will be rotated. This account has no user_roles rows on purpose — its
  // capabilities come from the flags fallback, which is exactly what a
  // pre-RBAC row looks like.
  const superA = await mkUser('super', { role: 'super_admin' })
  const superToken = superA.token

  const client = await mkUser('client')
  const staff = await mkUser('staff', { role: 'staff' })
  const delegator = await mkUser('delegator', { canDelegate: true })
  const promoter = await mkUser('promoter', { role: 'staff' })

  // The retention values we change below must be put back exactly as they were.
  const retentionBefore = (await api('/api/settings/retention', { token: superToken }))._b as {
    signatureRetentionSemesters: number
    purgeGraceDays: number
  }

  console.log('\n--- capability list from /auth/me ---')
  let r = await api('/api/auth/me', { token: staff.token })
  check('staff holds staff.access but not admin.users', Array.isArray(r._b?.capabilities)
  && r._b.capabilities.includes('staff.access')
  && !r._b.capabilities.includes('admin.users'), JSON.stringify(r._b?.capabilities))
  check('legacy booleans are still returned', typeof r._b?.canDelegate === 'boolean' && typeof r._b?.canConfigure === 'boolean')

  r = await api('/api/auth/me', { token: client.token })
  check('a plain client holds no officer capabilities', Array.isArray(r._b?.capabilities) && r._b.capabilities.length === 0, JSON.stringify(r._b?.capabilities))

  r = await api('/api/auth/me', { token: superToken })
  check('the super admin holds admin.all', (r._b?.capabilities ?? []).includes('admin.all'))

  console.log('\n--- staff.access ---')
  r = await api('/api/events', {
    method: 'POST',
    token: client.token,
    body: { title: `${tag} event`, date: new Date(Date.now() + 3600_000).toISOString(), lat: 10.72, lng: 122.56, radiusMeters: 50 }
  })
  check('client cannot create an event (403)', r._s === 403, `${r._s}`)

  r = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} event`, date: new Date(Date.now() + 3600_000).toISOString(), lat: 10.72, lng: 122.56, radiusMeters: 50, type: 'event' }
  })
  check('staff can create an event (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  if (r._s === 201) made.eventId = r._b?.id

  console.log('\n--- settings.manage ---')
  r = await api('/api/settings/retention', { method: 'PUT', token: staff.token, body: { signatureRetentionSemesters: 2, purgeGraceDays: 0 } })
  check('plain staff cannot change retention (403)', r._s === 403, `${r._s}`)

  r = await api('/api/settings/retention', { method: 'PUT', token: delegator.token, body: { signatureRetentionSemesters: 2, purgeGraceDays: 0 } })
  check('a delegator (canDelegate) can change retention (200)', r._s === 200, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- delegation.grant ---')
  r = await api('/api/delegations', { method: 'POST', token: client.token, body: { eventId: made.eventId, userId: staff.id, scopes: ['scan'] } })
  check('client cannot grant delegation (403)', r._s === 403, `${r._s}`)

  r = await api('/api/delegations', { method: 'POST', token: delegator.token, body: { eventId: made.eventId, userId: staff.id, scopes: ['scan'] } })
  check('a delegator can grant delegation (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- assigning a role grants the capability and mirrors the flag ---')
  r = await api(`/api/auth/users/${promoter.id}`, { method: 'PATCH', token: client.token, body: { roles: ['settings_manager'] } })
  check('a non-super-admin cannot assign roles (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/auth/users/${promoter.id}`, { method: 'PATCH', token: superToken, body: { roles: ['nonsense'] } })
  check('an unknown role key is refused (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/auth/users/${promoter.id}`, { method: 'PATCH', token: superToken, body: { roles: ['settings_manager'] } })
  check('assigning settings_manager returns the role + capability', r._s === 200
  && (r._b?.roles ?? []).includes('settings_manager')
  && (r._b?.capabilities ?? []).includes('settings.manage'), `${r._s} ${JSON.stringify(r._b?.roles)}`)
  const mirrored = await prisma.user.findUnique({ where: { id: promoter.id }, select: { canConfigure: true } })
  check('the legacy canConfigure flag mirrors the role', mirrored?.canConfigure === true)

  r = await api('/api/settings/retention', { method: 'PUT', token: promoter.token, body: { signatureRetentionSemesters: 2, purgeGraceDays: 0 } })
  check('the promoted officer can now change retention (200)', r._s === 200, `${r._s}`)

  r = await api(`/api/auth/users/${promoter.id}`, { method: 'PATCH', token: superToken, body: { roles: [] } })
  check('clearing the roles removes the granted capability', r._s === 200
  && !(r._b?.capabilities ?? []).includes('settings.manage')
  && (r._b?.roles ?? []).length === 0
  && (r._b?.capabilities ?? []).includes('staff.access'),
  JSON.stringify({ roles: r._b?.roles, caps: r._b?.capabilities }))
  const mirroredOff = await prisma.user.findUnique({ where: { id: promoter.id }, select: { canConfigure: true } })
  check('the legacy flag is cleared too', mirroredOff?.canConfigure === false)

  r = await api('/api/settings/retention', { method: 'PUT', token: promoter.token, body: { signatureRetentionSemesters: 2, purgeGraceDays: 0 } })
  check('the demoted officer is refused again (403)', r._s === 403, `${r._s}`)

  console.log('\n--- the legacy boolean route still works (both apps agree) ---')
  r = await api(`/api/auth/users/${promoter.id}`, { method: 'PATCH', token: superToken, body: { canDelegate: true } })
  check('the boolean form assigns the delegator role', r._s === 200 && (r._b?.roles ?? []).includes('delegator'), JSON.stringify(r._b?.roles))
  const delegatorRow = await prisma.userRole.findFirst({ where: { userId: promoter.id, role: { key: 'delegator' } } })
  check('a user_roles row was created', !!delegatorRow)

  console.log('\n--- audit trail ---')
  const audits = await prisma.auditLog.findMany({ where: { userId: promoter.id }, orderBy: { createdAt: 'desc' }, take: 10 })
  const actions = new Set(audits.map(a => a.action))
  check('role changes are audited (settings) ', actions.has('settings_access_granted') && actions.has('settings_access_removed'), [...actions].join(','))
  check('role changes are audited (delegation)', actions.has('delegate_power_granted'), [...actions].join(','))

  // Restore the retention values before cleanup.
  await api('/api/settings/retention', { method: 'PUT', token: superToken, body: retentionBefore })
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  const roleRows = await prisma.userRole.findMany({ where: { userId: { in: made.userIds } }, select: { userId: true, roleId: true } })
  void roleRows
  await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { performedBy: { in: made.userIds } }] } })
  if (made.eventId) {
    await prisma.attendance.deleteMany({ where: { eventId: made.eventId } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: made.eventId } })
    await prisma.event.delete({ where: { id: made.eventId } }).catch(() => {})
  }
  if (made.userIds.length) {
    await prisma.userRole.deleteMany({ where: { userId: { in: made.userIds } } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: made.userIds } } })
    await prisma.auditLog.deleteMany({ where: { details: { contains: tag } } })
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
