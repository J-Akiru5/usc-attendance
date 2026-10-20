import { getHeader, getMethod, readMultipartFormData } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, forbidStudents } from '../../utils/auth'
import { badRequest, defineApiHandler, forbidden, HttpError, notFound, respond } from '../../utils/http'
import { auditContext, auditWrite } from '../../utils/audit'
import { requireEventScope } from '../../utils/delegation'
import { assertEventActive } from '../../utils/cancellation'
import { idempotencyKeyProblem, normalizeIdempotencyKey } from '../../utils/attendance'
import { resolveScanTime } from '../../utils/offline'
import {
  attendancePhotoExpiresAt,
  attendancePhotoObjectKey,
  attendancePhotoSecret,
  attendancePhotoSizeProblem,
  attendancePhotoStore,
  attendancePhotoStoreProblem,
  attendancePhotoTypeProblem,
  signAttendancePhotoRef
} from '../../utils/attendance-photo'

const ALREADY_CHECKED_IN = 'Already checked in. Check out before checking in again.'

/** Multipart overhead is small; this only stops an obviously oversized body early. */
const MAX_UPLOAD_BODY_BYTES = 1_572_864 + 256 * 1024

// ---------------------------------------------------------------------------
// POST /api/attendance/photo — upload one ID photo for a manual check-in
//
// The client uploads before it records the check-in and sends the returned
// reference to POST /api/attendance. Nothing here returns a URL: the photo is
// written to private storage, and only the audited GET route can read it back.
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  forbidStudents(user)

  const declaredLength = Number(getHeader(event, 'content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BODY_BYTES) {
    throw new HttpError(413, 'That photo is larger than 1.5 MB — take a lower-resolution photo.')
  }

  let parts
  try {
    parts = await readMultipartFormData(event)
  } catch {
    throw badRequest('Send the photo as multipart form data.')
  }
  if (!parts) throw badRequest('Send the photo as multipart form data.')

  const field = (name: string) =>
    parts.find(part => part.name === name && !part.filename)?.data.toString('utf8').trim() ?? ''
  const photoPart = parts.find(part => part.name === 'photo' && !!part.filename)

  const eventId = field('eventId')
  const userId = field('userId')
  const rawKey = field('idempotencyKey')
  const rawCapturedAt = field('capturedAt')

  if (!eventId || !userId) throw badRequest('eventId and userId are required')
  if (!photoPart?.data?.length) throw badRequest('Attach a photo of the student ID.')

  const keyProblem = idempotencyKeyProblem(rawKey)
  if (keyProblem) throw badRequest(keyProblem)
  const idempotencyKey = normalizeIdempotencyKey(rawKey)
  if (!idempotencyKey) throw badRequest('idempotencyKey is required for photo evidence')

  const now = new Date()
  const capturedAt = resolveScanTime(rawCapturedAt || undefined, now)

  if (userId === user.id) {
    throw forbidden('You cannot manually record your own attendance.')
  }

  // Staff keep their manual access; a helper needs an active manual_checkin
  // grant for this event at the moment the photo was taken.
  await requireEventScope(prisma, user, eventId, 'manual_checkin', capturedAt)

  const eventRow = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true }
  })
  if (!eventRow) throw notFound('Event not found')
  assertEventActive(eventRow)

  // Mirror the attendance route's open-record guard so an obviously duplicate
  // manual entry does not leave an unreferenced identity photo behind.
  const open = await prisma.attendance.findFirst({
    where: { eventId, userId, checkOutAt: null },
    select: { id: true }
  })
  if (open) throw new HttpError(409, ALREADY_CHECKED_IN)

  const bytes = new Uint8Array(photoPart.data)
  const sizeProblem = attendancePhotoSizeProblem(bytes.length)
  if (sizeProblem) throw new HttpError(413, sizeProblem)

  const type = attendancePhotoTypeProblem(photoPart.type, bytes)
  if ('problem' in type) throw badRequest(type.problem)

  const secret = attendancePhotoSecret()
  if (!secret) {
    console.error('[attendance-photo] ATTENDANCE_PHOTO_SECRET and QR_SECRET are both unset — refusing to issue a photo reference')
    throw new HttpError(503, 'Photo evidence is not configured on this server.')
  }

  const storeProblem = attendancePhotoStoreProblem()
  const store = attendancePhotoStore()
  if (!store) {
    console.error(`[attendance-photo] private photo storage is unavailable: ${storeProblem ?? 'no store'}`)
    throw new HttpError(503, 'Photo evidence is not configured on this server.')
  }

  const objectKey = attendancePhotoObjectKey(idempotencyKey, type.mime)
  await store.put(objectKey, bytes, type.mime)

  const expiresAt = attendancePhotoExpiresAt(capturedAt)
  const photoRef = signAttendancePhotoRef(
    { key: objectKey, userId, eventId, capturedAt, mime: type.mime },
    secret
  )

  await auditWrite(prisma, {
    actor: user,
    action: 'attendance_photo_uploaded',
    targetType: 'event',
    targetId: eventId,
    userId,
    details: {
      targetUserId: userId,
      mime: type.mime,
      bytes: bytes.length,
      capturedAt: capturedAt.toISOString()
    },
    ...auditContext(event)
  })

  return respond(event, 201, {
    photoRef,
    capturedAt: capturedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  })
})
