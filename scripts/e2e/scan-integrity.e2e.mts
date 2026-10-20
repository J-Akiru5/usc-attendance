// Live end-to-end test: scan integrity (benchmark BC-5, plan §8.2). Proves the
// four promises the attendance route now makes:
//
//   1. a replayed key returns the first record and writes no second row;
//   2. a device clock that is ahead is stored as evidence, but the row keeps
//      server time as its authority;
//   3. a manual check-in without a reason is refused, and with one is stored
//      and audited;
//   4. a key presented by a different officer cannot read back the first
//      officer's record, and never becomes that officer's record.
//
// Requires the `20261020160000_scan_integrity` migration (scannedAt,
// idempotencyKey, manualReason). Throwaway `@example.invalid` data only,
// deleted afterwards.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'crypto'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { api, BASE_URL } from './client.mts'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2escanint' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], eventIds: string[] } = { userIds: [], eventIds: [] }
/** T-0009: private objects written by this run, including ones never attached. */
const uploadedPhotoKeys: string[] = []

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
  return { id: data.user.id, name: `E2E ${key}`, token: s.session.access_token }
}

const DATE = new Date(Date.now() + 6 * 86_400_000).toISOString()
const AT_VENUE = { lat: 10.72, lng: 122.56, accuracy: 8 }

/** A 1x1 PNG; the suite only proves the private write/read path, not image quality. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

async function uploadPhoto(token: string | null, form: FormData) {
  const response = await fetch(`${BASE_URL}/api/attendance/photo`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form
  })
  return {
    status: response.status,
    body: await response.json().catch(() => undefined) as any
  }
}

function photoForm(
  fields: { eventId: string, userId: string, idempotencyKey: string, capturedAt: string },
  bytes: Buffer = PNG,
  mime = 'image/png'
): FormData {
  const form = new FormData()
  form.append('photo', new Blob([new Uint8Array(bytes)], { type: mime }), 'student-id.png')
  form.append('eventId', fields.eventId)
  form.append('userId', fields.userId)
  form.append('idempotencyKey', fields.idempotencyKey)
  form.append('capturedAt', fields.capturedAt)
  return form
}

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const otherOfficer = await mkUser('officer2', { role: 'staff' })
  const replayStudent = await mkUser('replay', { role: 'student' })
  const clockStudent = await mkUser('clock', { role: 'student' })
  const manualStudent = await mkUser('manual', { role: 'student' })

  const created = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} assembly`, date: DATE, lat: AT_VENUE.lat, lng: AT_VENUE.lng, radiusMeters: 200 }
  })
  const eventId = created._b?.id
  if (created._s === 201) made.eventIds.push(eventId)
  check('an event exists to scan into (201)', created._s === 201 && eventId, `${created._s} ${JSON.stringify(created._b)}`)

  console.log('\n--- a retried scan is a replay, not a second check-in ---')
  const replayKey = randomUUID()
  const scannedAt = new Date(Date.now() - 2000).toISOString()
  const replayBody = {
    type: 'event',
    eventId,
    userId: replayStudent.id,
    method: 'barcode',
    ...AT_VENUE,
    scannedAt,
    idempotencyKey: replayKey
  }

  let r = await api('/api/attendance', { method: 'POST', token: staff.token, body: replayBody })
  const firstId = r._b?.id
  check('the first scan records (201)', r._s === 201 && !!firstId, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance', { method: 'POST', token: staff.token, body: replayBody })
  check('the retry returns the first record (200)', r._s === 200 && r._b?.id === firstId, `${r._s} ${JSON.stringify(r._b)}`)
  check('and says it was a replay', r._b?.replayed === true, `${r._b?.replayed}`)

  const rowsAfterReplay = await prisma.attendance.count({ where: { eventId, userId: replayStudent.id } })
  check('no second attendance row was written', rowsAfterReplay === 1, `${rowsAfterReplay}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: replayStudent.id, method: 'barcode', ...AT_VENUE }
  })
  check('the same scan without a key is still refused as a duplicate (403)', r._s === 403, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { ...replayBody, userId: clockStudent.id }
  })
  check('the same key for a different student is refused (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)

  console.log('\n--- a device clock that is ahead ---')
  const claimed = new Date(Date.now() + 60_000)
  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: {
      type: 'event',
      eventId,
      userId: clockStudent.id,
      method: 'barcode',
      ...AT_VENUE,
      scannedAt: claimed.toISOString(),
      idempotencyKey: randomUUID()
    }
  })
  check('a claim inside the grace window still records (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)

  const clockRow = await prisma.attendance.findFirst({
    where: { eventId, userId: clockStudent.id },
    select: { createdAt: true, scannedAt: true }
  })
  check('the device claim is stored as evidence', !!clockRow?.scannedAt && Math.abs(clockRow.scannedAt.getTime() - claimed.getTime()) < 1500, `${clockRow?.scannedAt?.toISOString()}`)
  check('the row keeps server time, not the claimed future', !!clockRow && Math.abs(clockRow.createdAt.getTime() - Date.now()) < 10_000, `${clockRow?.createdAt?.toISOString()}`)
  check('so the device is visibly ahead of the record', !!clockRow && claimed.getTime() - clockRow.createdAt.getTime() > 45_000, `${clockRow ? claimed.getTime() - clockRow.createdAt.getTime() : 'no row'}`)

  const beyondGrace = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: {
      type: 'event',
      eventId,
      userId: replayStudent.id,
      method: 'barcode',
      ...AT_VENUE,
      scannedAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      idempotencyKey: randomUUID()
    }
  })
  check('a claim beyond the grace window is refused (400)', beyondGrace._s === 400, `${beyondGrace._s} ${JSON.stringify(beyondGrace._b)}`)

  console.log('\n--- the manual fallback needs a reason ---')
  const manualKey = randomUUID()
  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: manualStudent.id, method: 'manual', ...AT_VENUE, idempotencyKey: manualKey }
  })
  check('a manual check-in without a reason is refused (400)', r._s === 400 && /reason/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  const reason = 'Phone dead, student showed their ID'
  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: { type: 'event', eventId, userId: manualStudent.id, method: 'manual', ...AT_VENUE, idempotencyKey: manualKey, manualReason: reason }
  })
  const manualId = r._b?.id
  check('with a reason it records (201)', r._s === 201 && !!manualId, `${r._s} ${JSON.stringify(r._b)}`)

  const manualRow = await prisma.attendance.findUnique({ where: { id: manualId } })
  check('the reason is stored on the row', manualRow?.manualReason === reason, `${manualRow?.manualReason}`)

  const audit = await prisma.auditLog.findFirst({
    where: { action: 'attendance_manual_entry', targetId: manualId },
    orderBy: { createdAt: 'desc' }
  })
  check('the manual entry is audited', !!audit, 'no audit row')
  check('the audit names the officer and the student', audit?.performedBy === staff.id && audit?.userId === manualStudent.id, `${audit?.performedBy} / ${audit?.userId}`)
  check('and carries the reason', !!audit?.details && audit.details.includes(reason), audit?.details ?? 'none')
  check('and records that no photo evidence was attached', audit?.details?.includes('"photo":"absent"') === true, audit?.details ?? 'none')

  console.log('\n--- photo evidence for the manual fallback (T-0009) ---')
  const photoStudent = await mkUser('photo', { role: 'student' })
  const otherStudent = await mkUser('photo-other', { role: 'student' })
  const capturedAt = new Date(Date.now() - 30_000).toISOString()
  const uploadKey = randomUUID()

  let upload = await uploadPhoto(null, photoForm({ eventId, userId: photoStudent.id, idempotencyKey: uploadKey, capturedAt }))
  check('an anonymous photo upload is refused (401)', upload.status === 401, `${upload.status} ${JSON.stringify(upload.body)}`)

  upload = await uploadPhoto(photoStudent.token, photoForm({ eventId, userId: photoStudent.id, idempotencyKey: uploadKey, capturedAt }))
  check('a student cannot upload photo evidence (403)', upload.status === 403, `${upload.status} ${JSON.stringify(upload.body)}`)

  upload = await uploadPhoto(staff.token, photoForm({ eventId, userId: photoStudent.id, idempotencyKey: uploadKey, capturedAt }))
  const photoRef = upload.body?.photoRef
  check('a staff upload stores the photo (201)', upload.status === 201 && typeof photoRef === 'string', `${upload.status} ${JSON.stringify(upload.body)}`)
  if (upload.status === 201) uploadedPhotoKeys.push(`attendance-photos/${uploadKey}.png`)
  const uploadBody = JSON.stringify(upload.body ?? {})
  check('the upload returns no key or public URL', !uploadBody.includes('attendance-photos/') && !/https?:\/\//.test(uploadBody), uploadBody)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: {
      type: 'event',
      eventId,
      userId: photoStudent.id,
      method: 'manual',
      ...AT_VENUE,
      idempotencyKey: uploadKey,
      manualReason: 'ID photographed at the door',
      photoRef
    }
  })
  const photoAttendanceId = r._b?.id
  check('the manual entry with a photo reference records (201)', r._s === 201 && !!photoAttendanceId, `${r._s} ${JSON.stringify(r._b)}`)
  check('and the response exposes neither the key nor a URL', !('photoKey' in (r._b ?? {})) && !JSON.stringify(r._b ?? {}).includes('attendance-photos/'), JSON.stringify(r._b))

  const photoRow = await prisma.attendance.findUnique({
    where: { id: photoAttendanceId },
    select: { photoKey: true, photoCapturedAt: true, photoExpiresAt: true }
  })
  check('the row stores a private key', photoRow?.photoKey?.startsWith('attendance-photos/') === true, `${photoRow?.photoKey}`)
  check(
    'with the capture moment and a 90-day expiry',
    !!photoRow?.photoCapturedAt && !!photoRow?.photoExpiresAt
    && Math.abs(photoRow.photoExpiresAt.getTime() - photoRow.photoCapturedAt.getTime() - 90 * 86_400_000) < 1000,
    `${photoRow?.photoCapturedAt?.toISOString()} → ${photoRow?.photoExpiresAt?.toISOString()}`
  )

  r = await api(`/api/attendance/${photoAttendanceId}/photo`)
  check('an anonymous photo read is refused (401)', r._s === 401, `${r._s}`)
  r = await api(`/api/attendance/${photoAttendanceId}/photo`, { token: photoStudent.token })
  check('the student cannot read the photo (403)', r._s === 403, `${r._s} ${JSON.stringify(r._b)}`)
  r = await api(`/api/attendance/${photoAttendanceId}/photo`, { token: staff.token })
  check(
    'staff read returns the private bytes (200 image/png)',
    r._s === 200 && String(r._h['content-type'] ?? '').startsWith('image/png') && Buffer.isBuffer(r._b) && r._b.length === PNG.length,
    `${r._s} ${r._h['content-type']} ${Buffer.isBuffer(r._b) ? r._b.length : 'not-bytes'}`
  )
  const readAudit = await prisma.auditLog.findFirst({
    where: { action: 'attendance_photo_viewed', targetId: photoAttendanceId },
    orderBy: { createdAt: 'desc' }
  })
  check('the staff read is audited', readAudit?.performedBy === staff.id && readAudit?.userId === photoStudent.id, `${readAudit?.performedBy} / ${readAudit?.userId}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: {
      type: 'event',
      eventId,
      userId: photoStudent.id,
      method: 'barcode',
      ...AT_VENUE,
      idempotencyKey: randomUUID(),
      photoRef
    }
  })
  check('a barcode check-in with a photo is refused (400)', r._s === 400 && /manual check-in/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  const selfKey = randomUUID()
  const selfUpload = await uploadPhoto(otherOfficer.token, photoForm({ eventId, userId: staff.id, idempotencyKey: selfKey, capturedAt }))
  if (selfUpload.status === 201) uploadedPhotoKeys.push(`attendance-photos/${selfKey}.png`)
  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: {
      type: 'event',
      eventId,
      userId: staff.id,
      method: 'self',
      ...AT_VENUE,
      idempotencyKey: selfKey,
      photoRef: selfUpload.body?.photoRef
    }
  })
  check('a self check-in with a photo is refused (400)', r._s === 400 && /manual check-in/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  const foreignKey = randomUUID()
  const foreignUpload = await uploadPhoto(staff.token, photoForm({ eventId, userId: otherStudent.id, idempotencyKey: foreignKey, capturedAt }))
  if (foreignUpload.status === 201) uploadedPhotoKeys.push(`attendance-photos/${foreignKey}.png`)
  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: {
      type: 'event',
      eventId,
      userId: photoStudent.id,
      method: 'manual',
      ...AT_VENUE,
      idempotencyKey: randomUUID(),
      manualReason: 'photo for another student',
      photoRef: foreignUpload.body?.photoRef
    }
  })
  check('a photo reference for another student is refused (400)', r._s === 400 && /different check-in/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/attendance', {
    method: 'POST',
    token: staff.token,
    body: {
      type: 'event',
      eventId,
      userId: photoStudent.id,
      method: 'manual',
      ...AT_VENUE,
      idempotencyKey: randomUUID(),
      manualReason: 'reuse the same photo',
      photoRef
    }
  })
  check('a photo reference cannot be attached twice (400)', r._s === 400 && /already been attached/i.test(r._b?.error ?? ''), `${r._s} ${JSON.stringify(r._b)}`)

  const textUpload = await uploadPhoto(
    staff.token,
    photoForm({ eventId, userId: otherStudent.id, idempotencyKey: randomUUID(), capturedAt }, Buffer.from('not an image'), 'text/plain')
  )
  check('a non-image upload is refused (400)', textUpload.status === 400 && /JPEG, PNG or WebP/i.test(textUpload.body?.error ?? ''), `${textUpload.status} ${JSON.stringify(textUpload.body)}`)

  console.log('\n--- another officer cannot use the key to read the record ---')
  r = await api('/api/attendance', { method: 'POST', token: otherOfficer.token, body: replayBody })
  const leak = JSON.stringify(r._b ?? {})
  check('a foreign key is refused (409)', r._s === 409, `${r._s} ${leak}`)
  check('the refusal leaks neither the record id nor the student', !leak.includes(firstId ?? 'missing-id') && !leak.includes(replayStudent.id) && !leak.includes(replayStudent.name), leak)

  const rowsAfterForeignReplay = await prisma.attendance.count({ where: { eventId, userId: replayStudent.id } })
  check('and writes nothing', rowsAfterForeignReplay === 1, `${rowsAfterForeignReplay}`)

  const firstOwner = await prisma.attendance.findUnique({ where: { id: firstId }, select: { recordedBy: true } })
  check('the first officer stays the recorded officer', firstOwner?.recordedBy === staff.id, `${firstOwner?.recordedBy}`)
  const foreignAttribution = await prisma.attendance.count({ where: { eventId, recordedBy: otherOfficer.id } })
  check('nothing is attributed to the second officer', foreignAttribution === 0, `${foreignAttribution}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  const photoRoot = resolve(process.env.ATTENDANCE_PHOTO_STORAGE_DIR ?? '.local/attendance-photos')
  for (const key of uploadedPhotoKeys) await rm(resolve(photoRoot, key), { force: true }).catch(() => {})
  if (made.eventIds.length) {
    // T-0009: a deleted attendance row does not delete the private object, so
    // remove the throwaway photos before the rows that point at them.
    const photoRows = await prisma.attendance.findMany({
      where: { eventId: { in: made.eventIds }, photoKey: { not: null } },
      select: { photoKey: true }
    })
    for (const row of photoRows) {
      if (row.photoKey) await rm(resolve(photoRoot, row.photoKey), { force: true }).catch(() => {})
    }
    await prisma.attendance.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.eventDelegate.deleteMany({ where: { eventId: { in: made.eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  }
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } })
  if (made.userIds.length) {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { performedBy: { in: made.userIds } }] } })
  }
  for (const id of made.userIds) {
    await prisma.studentProfile.deleteMany({ where: { userId: id } }).catch(() => {})
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
