// Live end-to-end test: audit-log integrity (benchmark BC-10, plan §11.2).
//
// Proves, against the running API and the real database:
//   1. a write records target type/id, actor role, request id and a *hashed*
//      client address (the raw address exists nowhere in the row);
//   2. the three sensitive reads are themselves audited (Student 360, an
//      excuse attachment, the scanner lookup) without carrying personal data;
//   3. the log is append-only in code — a written row is unchanged after later
//      requests, and no source file under server/ grows an update/delete path;
//   4. /api/settings/audit-health counts what just happened and is closed to
//      non-managers.
//
// Throwaway @example.invalid data; users, events, fines and the announcement
// are deleted afterwards. The audit rows are deliberately kept — the log is
// append-only, and "the suite ran" is a fact worth retaining.
import 'dotenv/config'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { api } from './client.mts'
import { hashIp } from '../../server/utils/audit'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2eaud' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], eventIds: string[], fineIds: string[], excuseIds: string[], announcementIds: string[] } = {
  userIds: [], eventIds: [], fineIds: [], excuseIds: [], announcementIds: []
}

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

const requestId = (suffix: string) => `${tag}-${suffix}`
const auditRow = (suffix: string) => prisma.auditLog.findFirst({ where: { requestId: requestId(suffix) } })

// A 1x1 transparent PNG — enough to prove the byte round trip.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function serverSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return serverSources(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

async function main() {
  const salt = process.env.AUDIT_IP_SALT
  if (!salt) throw new Error('AUDIT_IP_SALT is not set — start the suites through scripts/e2e/run.mts so the audit suite can check the hash')

  const manager = await mkUser('manager', { role: 'super_admin' })
  const student = await mkUser('student', { role: 'student' })
  const studentNo = tag.slice(-10).toUpperCase()
  await prisma.studentProfile.create({ data: { userId: student.id, studentNo } })

  const event = await prisma.event.create({
    data: { title: `${tag} assembly`, date: new Date(Date.now() - 86_400_000), lat: 10.72, lng: 122.56, createdBy: manager.id }
  })
  made.eventIds.push(event.id)

  console.log('\n--- a write carries target, actor, request id and a hashed IP ---')
  let r = await api('/api/announcements', {
    method: 'POST',
    token: manager.token,
    headers: { 'x-request-id': requestId('write') },
    body: { title: `${tag} notice`, body: 'A throwaway notice for the audit suite.' }
  })
  const announcementId = r._b?.announcement?.id
  if (r._s === 201) made.announcementIds.push(announcementId)
  check('the announcement is created (201)', r._s === 201 && !!announcementId, `${r._s} ${JSON.stringify(r._b)}`)

  const writeRow = await auditRow('write')
  const writeRowCount = await prisma.auditLog.count({ where: { requestId: requestId('write') } })
  check('the write produced exactly one audit row with its target', writeRowCount === 1 && !!writeRow && writeRow.action === 'announcement_created' && writeRow.targetType === 'announcement' && writeRow.targetId === announcementId,
    `${writeRowCount} ${JSON.stringify(writeRow)}`)
  check('the actor and their role are recorded', writeRow?.performedBy === manager.id && writeRow?.actorRole === 'super_admin',
    `${writeRow?.performedBy} ${writeRow?.actorRole}`)
  check('the request id came from the request', writeRow?.requestId === requestId('write'), `${writeRow?.requestId}`)
  check('the IP is a 64-character hash, not the raw address', !!writeRow?.ipHash && /^[0-9a-f]{64}$/.test(writeRow.ipHash),
    `${writeRow?.ipHash}`)
  const expectedHashes = [hashIp('127.0.0.1', salt), hashIp('::1', salt)]
  check('the hash is the salted address the server actually saw', expectedHashes.includes(writeRow?.ipHash ?? ''),
    `${writeRow?.ipHash}`)
  check('the raw address exists nowhere in the row', !JSON.stringify(writeRow ?? {}).includes('127.0.0.1') && !JSON.stringify(writeRow ?? {}).includes('::1'),
    JSON.stringify(writeRow))

  console.log('\n--- sensitive reads are audited, without the content ---')
  r = await api(`/api/analytics/students/${student.id}`, {
    token: manager.token,
    headers: { 'x-request-id': requestId('read360') }
  })
  check('Student 360 answers (200)', r._s === 200 && r._b?.student?.id === student.id, `${r._s}`)
  const studentRow = await auditRow('read360')
  check('the Student 360 read is a row against the student', studentRow?.action === 'student_record_viewed' && studentRow?.targetType === 'student' && studentRow?.targetId === student.id,
    JSON.stringify(studentRow))
  check('it names the reader and the subject', studentRow?.performedBy === manager.id && studentRow?.userId === student.id,
    `${studentRow?.performedBy} ${studentRow?.userId}`)
  const studentDetails = JSON.stringify(studentRow?.details ?? '')
  check('its details carry no name or student number', !studentDetails.includes('E2E student') && !studentDetails.includes(studentNo), studentDetails)

  // An excuse with evidence, so the attachment read can be exercised for real.
  const fine = await prisma.fine.create({ data: { userId: student.id, eventId: event.id, kind: 'absent', amountCentavos: 5000 } })
  made.fineIds.push(fine.id)
  r = await api(`/api/fines/${fine.id}/excuse`, {
    method: 'POST',
    token: student.token,
    headers: { 'x-request-id': requestId('excuse') },
    body: {
      category: 'medical',
      reason: 'A throwaway excuse for the audit suite.',
      attachment: { mime: 'image/png', dataBase64: PNG_BASE64 }
    }
  })
  const excuseId = r._b?.excuse?.id
  if (r._s === 201) made.excuseIds.push(excuseId)
  check('an excuse with evidence is filed (201)', r._s === 201 && !!excuseId, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api(`/api/excuses/${excuseId}/attachment`, {
    token: manager.token,
    headers: { 'x-request-id': requestId('attachment') }
  })
  check('staff open the evidence (200)', r._s === 200, `${r._s}`)
  const attachmentRow = await auditRow('attachment')
  check('opening the evidence is a row against the excuse', attachmentRow?.action === 'excuse_attachment_viewed' && attachmentRow?.targetType === 'excuse' && attachmentRow?.targetId === excuseId,
    JSON.stringify(attachmentRow))
  check('it names the reader and the student, not the document', attachmentRow?.performedBy === manager.id && attachmentRow?.userId === student.id && !JSON.stringify(attachmentRow?.details ?? '').includes(studentNo),
    `${attachmentRow?.performedBy} ${attachmentRow?.userId} ${attachmentRow?.details}`)

  r = await api(`/api/events/${event.id}/student-lookup`, {
    token: manager.token,
    headers: { 'x-request-id': requestId('lookup') },
    query: { q: studentNo }
  })
  check('the scanner lookup finds the student (200)', r._s === 200 && r._b?.exact === student.id, `${r._s} ${JSON.stringify(r._b?.exact)}`)
  const lookupRow = await auditRow('lookup')
  check('the lookup is a row against the event', lookupRow?.action === 'student_lookup_performed' && lookupRow?.targetType === 'event' && lookupRow?.targetId === event.id,
    JSON.stringify(lookupRow))
  const lookupDetails = JSON.stringify(lookupRow?.details ?? '')
  check('its details carry neither the query nor the person', !lookupDetails.includes(studentNo) && !lookupDetails.includes('E2E student') && lookupRow?.details?.includes('"matches"') === true,
    lookupDetails)

  console.log('\n--- the log is append-only ---')
  const writeRowAgain = await auditRow('write')
  const same = (a: typeof writeRow, b: typeof writeRowAgain) => JSON.stringify(a) === JSON.stringify(b)
  check('the earlier row is byte-identical after every later request', same(writeRow, writeRowAgain), 'a field changed')

  const forbidden = [
    { label: 'auditLog.update/delete/upsert', pattern: /\bauditLog\.(update|delete|upsert)/ },
    { label: 'raw UPDATE audit_logs', pattern: /\bUPDATE\s+"?audit_logs"?/i },
    { label: 'raw DELETE FROM audit_logs', pattern: /\bDELETE\s+FROM\s+"?audit_logs"?/i }
  ]
  const serverDir = fileURLToPath(new URL('../../server', import.meta.url))
  const violations: string[] = []
  for (const file of serverSources(serverDir)) {
    const text = readFileSync(file, 'utf8')
    for (const rule of forbidden) if (rule.pattern.test(text)) violations.push(`${file}: ${rule.label}`)
  }
  check('no server source can update or delete an audit row', violations.length === 0, violations.join('; '))

  console.log('\n--- audit health counts what just happened ---')
  r = await api('/api/settings/audit-health', { token: manager.token })
  const health = r._b ?? {}
  check('a settings manager reads the health summary (200)', r._s === 200 && Array.isArray(health.counts24h), `${r._s} ${JSON.stringify(r._b)}`)
  const count24 = (action: string) => (health.counts24h ?? []).find((row: { action: string }) => row.action === action)?.count ?? 0
  check('it counts the write and the three reads from the last 24 h',
    count24('announcement_created') >= 1
    && count24('student_record_viewed') >= 1
    && count24('student_lookup_performed') >= 1
    && count24('excuse_attachment_viewed') >= 1,
    JSON.stringify(health.counts24h))
  check('it reports the 7-day window, totals and silent gaps',
    (health.counts7d ?? []).length >= (health.counts24h ?? []).length
    && typeof health.totals?.last7d === 'number'
    && Array.isArray(health.silentGaps),
    JSON.stringify({ totals: health.totals, gaps: health.silentGaps }))
  check('every silent gap names three previous days', (health.silentGaps ?? []).every((gap: { previousDays?: unknown[] }) => gap.previousDays?.length === 3),
    JSON.stringify(health.silentGaps))

  r = await api('/api/settings/audit-health', { token: student.token })
  check('a student cannot read audit health (403)', r._s === 403, `${r._s}`)
  r = await api('/api/settings/audit-health')
  check('an anonymous caller cannot read it (401)', r._s === 401, `${r._s}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.announcementIds.length) await prisma.announcement.deleteMany({ where: { id: { in: made.announcementIds } } })
  if (made.excuseIds.length) await prisma.excuse.deleteMany({ where: { id: { in: made.excuseIds } } })
  if (made.fineIds.length) await prisma.fine.deleteMany({ where: { id: { in: made.fineIds } } })
  if (made.eventIds.length) await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  if (made.userIds.length) {
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { createdBy: { in: made.userIds } }] } })
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: made.userIds } } })
  }
  // No audit rows are deleted: the log is append-only, including for test runs.
  // The rows written here name throwaway @example.invalid users and remain as
  // evidence that the suite ran (the app has no purge path either).
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
