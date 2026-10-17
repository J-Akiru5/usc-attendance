import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, forbidden, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { authorizeScanLocation } from '../../utils/attendance-rules'
import { auditDelegationUse, requireEventScope } from '../../utils/delegation'
import { assertCheckInOpen } from '../../utils/retention'
import { verifyQrToken } from '../../utils/qr'

const ALREADY_CHECKED_IN = 'Already checked in. Check out before checking in again.'

// ---------------------------------------------------------------------------
// POST /api/attendance/qr  — scan a server-signed token
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const user = await authenticate(event)
  const { token, lat, lng, accuracy } = await readJsonBody(event) ?? {}

  if (!token || typeof token !== 'string') {
    throw badRequest('token is required')
  }

  // The scanner must be staff or hold an active "scan" grant for this event,
  // and cannot scan their own code.
  const payload = verifyQrToken(token)
  const { viaDelegation } = await requireEventScope(prisma, user, payload.e, 'scan')
  if (payload.u === user.id) {
    throw forbidden('You cannot check in with your own QR code')
  }

  // The scanner must physically be at the venue.
  const scanEvent = await prisma.event.findUnique({ where: { id: payload.e } })
  if (!scanEvent) throw notFound('Event not found')
  assertCheckInOpen(scanEvent)
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
        recordedBy: user.id
      },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } }
      }
    })

    if (viaDelegation) {
      await auditDelegationUse(prisma, user, payload.e, 'scan', {
        attendanceId: record.id,
        targetUserId: payload.u
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
