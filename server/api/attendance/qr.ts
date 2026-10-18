import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, forbidden, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { authorizeScanLocation } from '../../utils/attendance-rules'
import { auditDelegationUse, requireEventScope } from '../../utils/delegation'
import { assertCheckInOpen } from '../../utils/retention'
import { verifyQrToken } from '../../utils/qr'
import { hasExplicitScanTime, resolveScanTime, TOKEN_CLOCK_SKEW_SECONDS } from '../../utils/offline'

const ALREADY_CHECKED_IN = 'Already checked in. Check out before checking in again.'

// ---------------------------------------------------------------------------
// POST /api/attendance/qr  — scan a server-signed token
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const user = await authenticate(event)
  const { token, lat, lng, accuracy, scannedAt: rawScannedAt } = await readJsonBody(event) ?? {}

  if (!token || typeof token !== 'string') {
    throw badRequest('token is required')
  }

  // A queued offline scan carries the moment it happened; everything below is
  // then judged as of that moment (token lifetime, grants, the window) so a scan
  // taken while the token was alive still counts when it syncs later (§8.2).
  const scanTime = resolveScanTime(rawScannedAt)
  const stamped = hasExplicitScanTime(rawScannedAt)
  const scanSeconds = Math.floor(scanTime.getTime() / 1000)

  const payload = verifyQrToken(token, scanSeconds)
  if (scanSeconds < payload.i - TOKEN_CLOCK_SKEW_SECONDS) {
    throw badRequest('scannedAt predates that QR token — it did not exist when the scan supposedly happened')
  }
  const { viaDelegation } = await requireEventScope(prisma, user, payload.e, 'scan', scanTime)
  if (payload.u === user.id) {
    throw forbidden('You cannot check in with your own QR code')
  }

  // The scanner must physically be at the venue.
  const scanEvent = await prisma.event.findUnique({ where: { id: payload.e } })
  if (!scanEvent) throw notFound('Event not found')
  assertCheckInOpen(scanEvent, scanTime)
  const scannedAt = authorizeScanLocation(scanEvent, lat, lng, accuracy)

  // Check for open (not-yet-checked-out) record
  const existing = await prisma.attendance.findFirst({
    where: { eventId: payload.e, userId: payload.u, checkOutAt: null }
  })
  if (existing) {
    throw forbidden(ALREADY_CHECKED_IN)
  }

  try {
    const record = await prisma.attendance.create({
      data: {
        type: 'event',
        eventId: payload.e,
        userId: payload.u,
        method: 'qr',
        lat: scannedAt.lat,
        lng: scannedAt.lng,
        recordedBy: user.id,
        ...(stamped && { createdAt: scanTime })
      },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } }
      }
    })

    if (viaDelegation) {
      await auditDelegationUse(prisma, user, payload.e, 'scan', {
        attendanceId: record.id,
        targetUserId: payload.u,
        ...(stamped && { scannedAt: scanTime.toISOString(), syncedAt: new Date().toISOString() })
      })
    }

    return respond(event, 201, record)
  } catch (dbErr: unknown) {
    if (isUniqueViolation(dbErr)) {
      throw forbidden(ALREADY_CHECKED_IN)
    }
    throw dbErr
  }
})
