// Live end-to-end test: the offline scanner queue (plan §8.2). A scan taken with
// no signal is synced later with the moment it happened, and the server judges it
// as of that moment — token lifetime, delegate grants and the check-in window
// included. The headline case needs a real wait: a token is issued, the suite
// works while it lapses (30 s TTL), then syncs the queued scan and expects it to
// still record. Throwaway data, deleted afterwards.
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

const tag = 'e2eoffl' + Date.now()
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

const DATE = new Date(Date.now() + 6 * 86_400_000).toISOString()
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const delegate = await mkUser('delegate')
  const a = await mkUser('a', { role: 'student' })
  const b = await mkUser('b', { role: 'student' })
  const c = await mkUser('c', { role: 'student' })
  const d = await mkUser('d', { role: 'student' })

  const created = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} assembly`, date: DATE, lat: 10.72, lng: 122.56, radiusMeters: 200 }
  })
  const eventId = created._b?.id
  if (created._s === 201) made.eventIds.push(eventId)
  check('an event exists to scan into (201)', created._s === 201 && eventId, `${created._s}`)

  // The delegate's grant lapses while the scan is queued: it is valid at the
  // scan moment (captured below, well inside the window) and expired by the time
  // the queue syncs after the token wait.
  const grant = await prisma.eventDelegate.create({
    data: { eventId, userId: delegate.id, scopes: ['scan'], grantedBy: staff.id, expiresAt: new Date(Date.now() + 25_000) }
  })

  console.log('\n--- queued scans and the rules around their time ---')
  const tokenA = await api('/api/attendance/qr-token', { method: 'POST', token: a.token, body: { eventId } })
  const tokenB = await api('/api/attendance/qr-token', { method: 'POST', token: b.token, body: { eventId } })
  const tokenC = await api('/api/attendance/qr-token', { method: 'POST', token: c.token, body: { eventId } })
  const tokenD = await api('/api/attendance/qr-token', { method: 'POST', token: d.token, body: { eventId } })
  check('a student can issue their own QR token (200)', tokenA._s === 200 && typeof tokenA._b?.token === 'string' && typeof tokenA._b?.exp === 'number', `${tokenA._s}`)

  const issuedAt = new Date()
  const scanB = new Date(Date.now() - 2000)

  let r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenA._b?.token, lat: 10.72, lng: 122.56, accuracy: 8 }
  })
  check('a live scan records as before (201)', r._s === 201 && r._b?.method === 'qr', `${r._s}`)

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenB._b?.token, lat: 10.72, lng: 122.56, accuracy: 8, scannedAt: scanB.toISOString() }
  })
  check('a queued scan records at its own moment (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  const storedB = await prisma.attendance.findFirst({ where: { eventId, userId: b.id }, select: { createdAt: true } })
  check('the row carries the scan time, not the sync time', Math.abs((storedB?.createdAt.getTime() ?? 0) - scanB.getTime()) < 1500, `${storedB?.createdAt?.toISOString()} vs ${scanB.toISOString()}`)

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenB._b?.token, lat: 10.72, lng: 122.56, scannedAt: new Date(Date.now() + 10 * 60_000).toISOString() }
  })
  check('a scan claiming the future is refused (400)', r._s === 400, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenB._b?.token, lat: 10.72, lng: 122.56, scannedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() }
  })
  check('a scan older than 48 hours is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenB._b?.token, lat: 10.72, lng: 122.56, scannedAt: 'last tuesday' }
  })
  check('a nonsense scan time is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenA._b?.token, lat: 10.72, lng: 122.56, scannedAt: new Date(issuedAt.getTime() - 120_000).toISOString() }
  })
  check('a scan cannot predate its own token (400)', r._s === 400, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- waiting for the token to expire (30 s TTL) ---')
  const queuedAt = new Date(Date.now() - 1000).toISOString()
  await sleep(32_000)
  console.log('    ...syncing a scan taken while the token was alive')

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenC._b?.token, lat: 10.72, lng: 122.56, accuracy: 8 }
  })
  check('the same token is expired for a live scan now (403)', r._s === 403 && /expired/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: {
      token: tokenC._b?.token,
      lat: 10.72,
      lng: 122.56,
      scannedAt: new Date((tokenC._b?.exp ?? 0) * 1000 + 5000).toISOString()
    }
  })
  check('a scan claiming a moment after it expired is refused (403)', r._s === 403, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenC._b?.token, lat: 10.72, lng: 122.56, accuracy: 8, scannedAt: queuedAt }
  })
  check('the queued scan still records after it expired (201)', r._s === 201 && r._b?.user?.id === c.id, `${r._s} ${JSON.stringify(r._b)}`)
  const storedC = await prisma.attendance.findFirst({ where: { eventId, userId: c.id }, select: { createdAt: true } })
  check('and it is stamped with the scan moment', Math.abs((storedC?.createdAt.getTime() ?? 0) - new Date(queuedAt).getTime()) < 1500, `${storedC?.createdAt?.toISOString()}`)

  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: staff.token,
    body: { token: tokenC._b?.token, lat: 10.72, lng: 122.56, accuracy: 8, scannedAt: queuedAt }
  })
  check('replaying the queue does not double-record (403)', r._s === 403 && /already checked in/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- the delegate whose grant lapsed since the scan ---')
  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: delegate.token,
    body: { token: tokenD._b?.token, lat: 10.72, lng: 122.56, accuracy: 8, scannedAt: queuedAt }
  })
  check('a scan taken while the grant was live still counts (201)', r._s === 201 && r._b?.user?.id === d.id, `${r._s} ${JSON.stringify(r._b)}`)

  const delegationAudit = await prisma.auditLog.findFirst({
    where: { performedBy: delegate.id },
    orderBy: { createdAt: 'desc' }
  })
  check('and the late sync is audited with both moments', !!delegationAudit?.details && /scannedAt/.test(delegationAudit.details) && /syncedAt/.test(delegationAudit.details), delegationAudit?.details ?? 'none')

  // A stale scan cannot smuggle a check-in from somewhere else either.
  const e = await mkUser('e', { role: 'student' })
  const tokenE = await api('/api/attendance/qr-token', { method: 'POST', token: e.token, body: { eventId } })
  const lateGrant = await prisma.eventDelegate.create({
    data: { eventId, userId: delegate.id, scopes: ['scan'], grantedBy: staff.id, expiresAt: new Date(Date.now() + 60_000) }
  })
  r = await api('/api/attendance/qr', {
    method: 'POST',
    token: delegate.token,
    body: { token: tokenE._b?.token, lat: 11.9, lng: 123.6, accuracy: 8, scannedAt: queuedAt }
  })
  check('the venue rule still applies to a late sync', r._s === 400 || r._s === 403, `${r._s} ${JSON.stringify(r._b)}`)

  await prisma.eventDelegate.delete({ where: { id: grant.id } })
  await prisma.eventDelegate.delete({ where: { id: lateGrant.id } })
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
