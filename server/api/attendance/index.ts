import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import {
  badRequest,
  defineApiHandler,
  forbidden,
  isUniqueViolation,
  notFound,
  readJsonBody,
  respond
} from '../../utils/http'
import {
  authorizeDutySelfCheckIn,
  authorizeEventSelfCheckIn,
  authorizeManualCheckIn,
  authorizeScanLocation
} from '../../utils/attendance-rules'
import { auditDelegationUse, requireEventScope } from '../../utils/delegation'
import { assertCheckInOpen } from '../../utils/retention'
import { hasExplicitScanTime, resolveScanTime } from '../../utils/offline'
import { manilaDayRange } from '../../utils/time'

const ALREADY_CHECKED_IN = 'Already checked in. Check out before checking in again.'

// ---------------------------------------------------------------------------
// GET/POST /api/attendance
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const routeMethod = getMethod(event)
  const user = await authenticate(event)

  if (routeMethod === 'GET') {
    const query = getQuery(event)
    const eventId = query.eventId as string
    if (!eventId) {
      throw badRequest('eventId query parameter is required')
    }
    await requireEventScope(prisma, user, eventId, 'view_roster')

    const records = await prisma.attendance.findMany({
      where: { eventId },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } },
        recorder: { select: { id: true, name: true, position: true } },
        signature: { select: { signedAt: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return records
  }

  if (routeMethod === 'POST') {
    const { type, eventId, dutyDate, userId, method, lat, lng, accuracy, scannedAt: rawScannedAt } = await readJsonBody(event) ?? {}

    if (!userId || !method) {
      throw badRequest('Missing required fields')
    }

    // A queued offline scan carries the moment it happened; the guards below are
    // then applied as of that moment rather than the sync time (plan §8.2).
    const scanTime = resolveScanTime(rawScannedAt)
    const stamped = hasExplicitScanTime(rawScannedAt)

    const attendanceType = type || 'event'

    // Students are checked in by an officer scanning their QR - never by themselves.
    if (method === 'self' && user.role === 'student') {
      throw forbidden('Students are checked in by an officer. Show your QR code at the venue.')
    }

    if (attendanceType === 'event' && !eventId) {
      throw badRequest('eventId is required for event check-ins')
    }

    if (attendanceType === 'duty' && !dutyDate) {
      throw badRequest('dutyDate is required for duty check-ins')
    }

    if (method !== 'self' && method !== 'manual' && method !== 'barcode') {
      throw badRequest('method must be \'self\', \'manual\' or \'barcode\'. QR check-ins go through /api/attendance/qr with a signed token.')
    }

    // Resolve who may record whom, how, and where — all server-side.
    let resolved: { lat: number | null, lng: number | null } = { lat: null, lng: null }
    let delegatedScope: 'manual_checkin' | null = null
    if (method === 'self') {
      if (attendanceType === 'event') {
        const event = await prisma.event.findUnique({ where: { id: eventId } })
        if (!event) {
          throw notFound('Event not found')
        }
        assertCheckInOpen(event)
        resolved = authorizeEventSelfCheckIn({
          actor: user,
          targetUserId: userId,
          lat,
          lng,
          geofence: event
        })
      } else {
        resolved = authorizeDutySelfCheckIn({ actor: user, targetUserId: userId, lat, lng })
      }
    } else {
      if (attendanceType === 'event') {
        // Staff, or an officer holding an active "manual_checkin" grant for this event.
        // A barcode scan of a student ID rides this same path: the officer is the
        // one identifying the student, only the identifier differs.
        const { viaDelegation } = await requireEventScope(prisma, user, eventId, 'manual_checkin', scanTime)
        if (userId === user.id) {
          throw forbidden('You cannot manually record your own attendance.')
        }
        delegatedScope = viaDelegation ? 'manual_checkin' : null
        if (viaDelegation) {
          // A temporary helper must be at the venue; staff overrides stay exempt.
          const event = await prisma.event.findUnique({ where: { id: eventId } })
          if (!event) throw notFound('Event not found')
          assertCheckInOpen(event, scanTime)
          const here = authorizeScanLocation(event, lat, lng, accuracy)
          resolved = { lat: here.lat, lng: here.lng }
        }
      } else {
        authorizeManualCheckIn(user, userId)
      }
    }

    // Check for open (not-yet-checked-out) record
    if (attendanceType === 'event') {
      const existing = await prisma.attendance.findFirst({
        where: { eventId, userId, checkOutAt: null }
      })
      if (existing) {
        throw forbidden(ALREADY_CHECKED_IN)
      }
    } else {
      const { gte, lt } = manilaDayRange(new Date(dutyDate))
      const existing = await prisma.attendance.findFirst({
        where: {
          userId,
          type: 'duty',
          dutyDate: { gte, lt },
          checkOutAt: null
        }
      })
      if (existing) {
        throw forbidden(ALREADY_CHECKED_IN)
      }
    }

    try {
      const record = await prisma.attendance.create({
        data: {
          type: attendanceType,
          eventId: attendanceType === 'event' ? eventId : null,
          dutyDate: attendanceType === 'duty' ? new Date(dutyDate) : null,
          userId,
          method,
          lat: resolved.lat,
          lng: resolved.lng,
          recordedBy: user.id,
          ...(stamped && { createdAt: scanTime })
        },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } }
        }
      })

      if (delegatedScope) {
        await auditDelegationUse(prisma, user, eventId, delegatedScope, {
          attendanceId: record.id,
          targetUserId: userId,
          ...(stamped && { scannedAt: scanTime.toISOString(), syncedAt: new Date().toISOString() })
        })
      }

      return respond(event, 201, record)
    } catch (dbErr: unknown) {
      // P2002 = unique constraint violation (race fallback from partial unique index)
      if (isUniqueViolation(dbErr)) {
        throw forbidden(ALREADY_CHECKED_IN)
      }
      throw dbErr
    }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
