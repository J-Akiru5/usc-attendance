// Live end-to-end test: creates throwaway users/event in the connected DB, exercises the real handlers, then deletes everything.
// Run: npx tsx scripts/e2e/delegation.e2e.mts
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import * as D from '../../api/_handlers/delegations.js'
import * as A from '../../api/_handlers/attendance.js'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2edel' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

function res() {
  const r: any = { _s: 0, _b: undefined, _h: {} }
  r.status = (c: number) => { r._s = c; return r }
  r.json = (b: any) => { r._b = b; return r }
  r.send = (b: any) => { r._b = b; return r }
  r.end = () => r
  r.setHeader = (k: string, v: string) => { r._h[k] = v }
  return r
}
const rq = (token: string, method: string, body: any = {}, query: any = {}) =>
  ({ headers: { authorization: `Bearer ${token}` }, method, body, query }) as any

const made: { ids: string[]; eventId?: string } = { ids: [] }

async function mkUser(key: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${key}@example.invalid`
  const password = randomBytes(12).toString('base64url') + 'aA1!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await prisma.user.create({
    data: { id: data.user.id, email, name: `E2E ${key}`, position: 'Test', role: 'client', mustChangePassword: false, active: true, ...extra },
  })
  const c = anon()
  const { data: s, error: se } = await c.auth.signInWithPassword({ email, password })
  if (se || !s.session) throw se
  made.ids.push(data.user.id)
  return { id: data.user.id, token: s.session.access_token }
}

async function main() {
  const base = await prisma.user.findUnique({ where: { email: 'admin@usc.edu.ph' } })
  const ev = await prisma.event.create({
    data: { title: `${tag} event`, date: new Date(Date.now() + 3600_000), lat: 10.72, lng: 122.56, radiusMeters: 50, createdBy: base!.id },
  })
  made.eventId = ev.id

  const granter = await mkUser('granter', { canDelegate: true })
  const delegate = await mkUser('delegate')
  const outsider = await mkUser('outsider')
  const s1 = await mkUser('subject1')
  const s2 = await mkUser('subject2')
  const s3 = await mkUser('subject3')

  const qrFor = async (u: { token: string }) => {
    const r = res()
    await A.qrToken(rq(u.token, 'POST', { eventId: ev.id }), r)
    return r._b.token as string
  }
  const grant = async (who: typeof granter, userId: string, scopes: string[], extra: any = {}) => {
    const r = res()
    await D.delegations(rq(who.token, 'POST', { eventId: ev.id, userId, scopes, ...extra }), r)
    return r
  }

  console.log('\n--- granting rules ---')
  let r = await grant(outsider, delegate.id, ['scan'])
  check('non-delegator cannot grant (403)', r._s === 403, `${r._s} ${JSON.stringify(r._b)}`)
  r = await grant(granter, granter.id, ['scan'])
  check('cannot grant access to yourself (403)', r._s === 403, `${r._s}`)
  r = await grant(granter, delegate.id, ['bogus'])
  check('unknown scope rejected (400)', r._s === 400, `${r._s}`)
  r = await grant(granter, delegate.id, ['scan'])
  check('President/Secretary can grant scan (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- scope enforcement for the delegate ---')
  r = res(); await A.qr(rq(delegate.token, 'POST', { token: await qrFor(s1) }), r)
  check('delegate with scan can scan a QR (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  r = res(); await A.qr(rq(outsider.token, 'POST', { token: await qrFor(s2) }), r)
  check('officer without any grant cannot scan (403)', r._s === 403, `${r._s}`)
  r = res(); await A.index(rq(delegate.token, 'POST', { type: 'event', eventId: ev.id, userId: s2.id, method: 'manual' }), r)
  check('scan-only delegate cannot record manually (403)', r._s === 403, `${r._s}`)
  r = res(); await A.index(rq(delegate.token, 'GET', {}, { eventId: ev.id }), r)
  check('scan-only delegate cannot view roster (403)', r._s === 403, `${r._s}`)
  r = res(); await A.exportAttendance(rq(delegate.token, 'GET', {}, { eventId: ev.id }), r)
  check('scan-only delegate cannot export (403)', r._s === 403, `${r._s}`)
  r = res(); await A.qr(rq(delegate.token, 'POST', { token: await qrFor(delegate) }), r)
  check('delegate cannot scan their own QR (403)', r._s === 403, `${r._s}`)

  console.log('\n--- replacing a grant widens scope ---')
  r = await grant(granter, delegate.id, ['scan', 'manual_checkin', 'view_roster', 'export'])
  check('re-grant with all scopes (201)', r._s === 201, `${r._s}`)
  const live = await prisma.eventDelegate.count({ where: { eventId: ev.id, userId: delegate.id, revokedAt: null } })
  check('only one live grant per officer per event', live === 1, `live=${live}`)
  r = res(); await A.index(rq(delegate.token, 'POST', { type: 'event', eventId: ev.id, userId: s2.id, method: 'manual' }), r)
  check('manual_checkin works (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)
  r = res(); await A.index(rq(delegate.token, 'POST', { type: 'event', eventId: ev.id, userId: delegate.id, method: 'manual' }), r)
  check('cannot manually record yourself (403)', r._s === 403, `${r._s}`)
  r = res(); await A.index(rq(delegate.token, 'GET', {}, { eventId: ev.id }), r)
  check('view_roster works (200, 2 records)', r._s === 200 && r._b.length === 2, `${r._s} ${JSON.stringify(r._b)?.slice(0, 120)}`)
  r = res(); await A.exportAttendance(rq(delegate.token, 'GET', {}, { eventId: ev.id }), r)
  check('export works (200, csv)', r._s === 200 && String(r._b).includes('Name,Position'), `${r._s}`)

  console.log('\n--- my grants ---')
  r = res(); await D.myDelegations(rq(delegate.token, 'GET'), r)
  check('/delegations/mine lists the active grant', r._s === 200 && r._b.length === 1 && r._b[0].event?.id === ev.id, `${r._s} ${JSON.stringify(r._b)?.slice(0, 120)}`)

  console.log('\n--- revocation is immediate ---')
  const g = await prisma.eventDelegate.findFirst({ where: { eventId: ev.id, userId: delegate.id, revokedAt: null } })
  r = res(); await D.delegationById(rq(outsider.token, 'DELETE'), r, g!.id)
  check('non-delegator cannot revoke (403)', r._s === 403, `${r._s}`)
  r = res(); await D.delegationById(rq(granter.token, 'DELETE'), r, g!.id)
  check('President/Secretary can revoke (200)', r._s === 200, `${r._s}`)
  r = res(); await A.qr(rq(delegate.token, 'POST', { token: await qrFor(s3) }), r)
  check('scan after revoke is blocked (403)', r._s === 403, `${r._s}`)

  console.log('\n--- expiry ---')
  r = await grant(granter, delegate.id, ['scan'])
  check('new grant after revoke (201)', r._s === 201, `${r._s}`)
  await prisma.eventDelegate.updateMany({ where: { eventId: ev.id, userId: delegate.id, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } })
  r = res(); await A.qr(rq(delegate.token, 'POST', { token: await qrFor(s3) }), r)
  check('scan after expiry is blocked (403)', r._s === 403, `${r._s}`)

  console.log('\n--- audit trail ---')
  const audit = await prisma.auditLog.findMany({ where: { OR: [{ userId: { in: made.ids } }, { performedBy: { in: made.ids } }] } })
  const kinds = new Set(audit.map((a) => a.action))
  check('granted / revoked / used all audited', ['delegation_granted', 'delegation_revoked', 'delegation_used'].every((k) => kinds.has(k)), [...kinds].join(','))
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.ids.length) {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.ids } }, { performedBy: { in: made.ids } }] } })
  }
  if (made.eventId) {
    await prisma.attendance.deleteMany({ where: { eventId: made.eventId } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: made.eventId } })
    await prisma.event.delete({ where: { id: made.eventId } }).catch(() => {})
  }
  for (const id of made.ids) {
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
