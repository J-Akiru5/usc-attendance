import { getMethod, getRouterParam, setResponseHeader, setResponseStatus } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, forbidStudents } from '../../../utils/auth'
import { defineApiHandler, HttpError, notFound } from '../../../utils/http'
import { requireEventScope } from '../../../utils/delegation'
import { auditContext, auditRead } from '../../../utils/audit'
import {
  attendancePhotoContentType,
  attendancePhotoStore,
  attendancePhotoStoreProblem
} from '../../../utils/attendance-photo'

// ---------------------------------------------------------------------------
// GET /api/attendance/:id/photo — the ID photo, for roster staff only
//
// This is the ONLY read path. A student, an anonymous caller and anyone without
// a view_roster grant for the event are refused before storage is touched; a
// successful read writes an audit row. On object storage the response is a
// 60-second signed URL (the object itself stays private); on the filesystem the
// bytes stream through this authenticated route. Neither is a permanent URL and
// neither is cacheable.
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') throw new HttpError(405, 'Method not allowed')

  const user = await authenticate(event)
  forbidStudents(user)
  const id = getRouterParam(event, 'id') ?? ''

  const row = await prisma.attendance.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      type: true,
      method: true,
      eventId: true,
      photoKey: true,
      photoExpiresAt: true
    }
  })
  if (!row || !row.photoKey || row.type !== 'event' || row.method !== 'manual' || !row.eventId) {
    throw notFound('No photo evidence for this check-in')
  }
  if (row.photoExpiresAt && row.photoExpiresAt.getTime() <= Date.now()) {
    throw notFound('This photo is no longer available')
  }

  // Staff, or a helper holding an active view_roster grant for this event.
  // A student has neither, so this is the refusal point for them.
  const { viaDelegation } = await requireEventScope(prisma, user, row.eventId, 'view_roster')

  const store = attendancePhotoStore()
  if (!store) {
    console.error(`[attendance-photo] read refused — private photo storage is unavailable: ${attendancePhotoStoreProblem() ?? 'no store'}`)
    throw new HttpError(503, 'Photo evidence is not configured on this server.')
  }

  const auditReadRow = (surface: 'stream' | 'signed-url') => auditRead(prisma, {
    actor: user,
    action: 'attendance_photo_viewed',
    targetType: 'attendance',
    targetId: row.id,
    userId: row.userId,
    details: { surface: 'attendance_photo', viaDelegation, delivery: surface },
    ...auditContext(event)
  })

  setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setResponseHeader(event, 'Pragma', 'no-cache')
  setResponseHeader(event, 'Vary', 'Authorization')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')

  if (store.signedGetUrl) {
    const url = await store.signedGetUrl(row.photoKey, 60)
    await auditReadRow('signed-url')
    setResponseStatus(event, 302)
    setResponseHeader(event, 'Location', url)
    return null
  }

  let bytes: Uint8Array
  try {
    bytes = await store.get(row.photoKey)
  } catch {
    // Never echo a storage error: it can contain a key or an account id.
    throw notFound('This photo is no longer available')
  }

  await auditReadRow('stream')
  const contentType = attendancePhotoContentType(row.photoKey)
  setResponseHeader(event, 'Content-Type', contentType)
  setResponseHeader(event, 'Content-Length', bytes.length)
  setResponseHeader(event, 'Content-Disposition', 'inline; filename="attendance-photo"')
  setResponseHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin')
  return bytes
})
