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
import { auditContext, auditWrite } from '../../utils/audit'
import { auditDelegationUse, requireEventScope } from '../../utils/delegation'
import { assertCheckInOpen } from '../../utils/retention'
import { hasExplicitScanTime, resolveScanTime } from '../../utils/offline'
import { assertEventActive } from '../../utils/cancellation'
import { assertScanBudget } from '../../utils/rate-limit'
import { manilaDayRange } from '../../utils/time'
import {
  decideDeviceTime,
  idempotencyKeyProblem,
  idempotencyOutcome,
  manualReasonProblem,
  normalizeIdempotencyKey,
  normalizeManualReason
} from '../../utils/attendance'

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
    // The scan budget is checked before the body is parsed: a caller that has
    // spent its allowance is answered without the server doing any other work.
    await assertScanBudget(event, user, prisma)

    const {
      type, eventId, dutyDate, userId, method, lat, lng, accuracy,
      scannedAt: rawScannedAt, idempotencyKey: rawKey, manualReason: rawReason
    } = await readJsonBody(event) ?? {}

    if (!userId || !method) {
      throw badRequest('Missing required fields')
    }

    if (method !== 'self' && method !== 'manual' && method !== 'barcode') {
      throw badRequest('method must be \'self\', \'manual\' or \'barcode\'. QR check-ins go through /api/attendance/qr with a signed token.')
    }

    // An opaque per-scan key, optional for a live scan. A queued scan reuses the
    // key it was given when it was taken, so a retry after a lost response is a
    // replay rather than a second row (benchmark BC-5).
    const keyProblem = idempotencyKeyProblem(rawKey)
    if (keyProblem) throw badRequest(keyProblem)
    const idempotencyKey = normalizeIdempotencyKey(rawKey)

    // The device clock is evidence; the server clock is the authority. A queued
    // scan still keeps its own moment for the window/fines, while a phone that
    // claims the future is clamped to server time (and refused beyond the grace
    // window). The raw claim is stored in `scannedAt` either way.
    const now = new Date()
    const deviceAt = hasExplicitScanTime(rawScannedAt) ? resolveScanTime(rawScannedAt, now) : null
    const timing = decideDeviceTime(deviceAt, now)
    if (!timing.accepted) throw badRequest('scannedAt cannot be in the future')
    const scanTime = timing.effectiveAt

    const attendanceType = type || 'event'
    const target = {
      type: attendanceType,
      eventId: attendanceType === 'event' && typeof eventId === 'string' ? eventId : null,
      userId: String(userId)
    }

    // A replay must be answered before any guard: the first request already
    // passed them, and re-running "already checked in" would turn a retry into a
    // refusal. The key never lets an officer read another officer's record — a
    // foreign key is a conflict with no details.
    const existingByKey = idempotencyKey
      ? await prisma.attendance.findUnique({
          where: { idempotencyKey },
          include: { user: { select: { id: true, name: true, position: true, role: true } } }
        })
      : null
    const replay = idempotencyOutcome(existingByKey, { officerId: user.id, ...target })
    if (replay === 'conflict') {
      throw new HttpError(409, 'That scan key has already been used for a different check-in.')
    }
    if (replay === 'replay' && existingByKey) {
      return respond(event, 200, { ...existingByKey, replayed: true })
    }

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
        } else {
          // Cancellation applies to everyone — staff keep their window and venue
          // overrides, but a cancelled event is inert for them too (BC-7).
          const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, status: true } })
          if (!event) throw notFound('Event not found')
          assertEventActive(event)
        }
      } else {
        authorizeManualCheckIn(user, userId)
      }
    }

    // The manual fallback is the one place an officer picks a person by hand;
    // the reason is what makes that choice reviewable (benchmark BC-5d). It is
    // validated after authorization deliberately: an unauthorised caller gets
    // 403, not a complaint about a field they were never allowed to send.
    let manualReason: string | null = null
    if (method === 'manual') {
      const reasonProblem = manualReasonProblem(rawReason)
      if (reasonProblem) throw badRequest(reasonProblem)
      manualReason = normalizeManualReason(rawReason)
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

    const scan = {
      type: attendanceType,
      eventId: attendanceType === 'event' ? eventId : null,
      dutyDate: attendanceType === 'duty' ? new Date(dutyDate) : null,
      userId,
      method,
      lat: resolved.lat,
      lng: resolved.lng,
      recordedBy: user.id,
      scannedAt: timing.scannedAt,
      idempotencyKey,
      manualReason,
      // A queued scan keeps its own (past) moment; a device claiming the future
      // does not move the row — the server clock is the authority (BC-5).
      ...(timing.usedDeviceTime && { createdAt: scanTime })
    }

    try {
      const record = await prisma.$transaction(async (tx) => {
        const created = await tx.attendance.create({
          data: scan,
          include: {
            user: { select: { id: true, name: true, position: true, role: true } }
          }
        })

        // The reason is part of recording the row, not a best-effort footnote:
        // if the audit cannot be written, the manual check-in is not recorded.
        if (manualReason) {
          await auditWrite(tx, {
            actor: user,
            action: 'attendance_manual_entry',
            targetType: 'attendance',
            targetId: created.id,
            userId,
            details: {
              reason: manualReason,
              method,
              type: attendanceType,
              eventId: created.eventId,
              scannedAt: timing.scannedAt?.toISOString() ?? null
            },
            ...auditContext(event)
          })
        }

        return created
      })

      if (delegatedScope) {
        await auditDelegationUse(prisma, user, eventId, delegatedScope, {
          attendanceId: record.id,
          targetUserId: userId,
          ...(timing.usedDeviceTime && { scannedAt: scanTime.toISOString(), syncedAt: new Date().toISOString() })
        })
      }

      return respond(event, 201, record)
    } catch (dbErr: unknown) {
      // P2002 = unique constraint violation. The open-record indexes catch two
      // officers racing the same student; the key catches two copies of the same
      // request. A raced key returns the winner, so the retry still sees success.
      if (isUniqueViolation(dbErr)) {
        if (idempotencyKey) {
          const raced = await prisma.attendance.findUnique({
            where: { idempotencyKey },
            include: { user: { select: { id: true, name: true, position: true, role: true } } }
          })
          const racedOutcome = idempotencyOutcome(raced, { officerId: user.id, ...target })
          if (racedOutcome === 'replay' && raced) {
            return respond(event, 200, { ...raced, replayed: true })
          }
          if (racedOutcome === 'conflict') {
            throw new HttpError(409, 'That scan key has already been used for a different check-in.')
          }
        }
        throw forbidden(ALREADY_CHECKED_IN)
      }
      throw dbErr
    }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
