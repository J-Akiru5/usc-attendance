import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, forbidStudents } from '../../utils/auth'
import { badRequest, defineApiHandler, forbidden, notFound, readJsonBody, respond } from '../../utils/http'
import { authorizeManualCheckIn } from '../../utils/attendance-rules'
import { auditDelegationUse, requireEventScope } from '../../utils/delegation'
import { manilaDayRange, manilaHHMM } from '../../utils/time'

// ---------------------------------------------------------------------------
// POST /api/attendance/checkout
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const user = await authenticate(event)
  const { eventId, dutyDate, userId } = await readJsonBody(event) ?? {}

  if (!userId) {
    throw badRequest('userId is required')
  }

  if (!eventId && !dutyDate) {
    throw badRequest('Either eventId or dutyDate is required')
  }

  // Determine self-checkout vs manual checkout
  const isSelf = user.id === userId
  if (isSelf) forbidStudents(user)
  let delegatedCheckout = false
  if (!isSelf) {
    if (eventId) {
      // Staff, or an officer holding an active "manual_checkin" grant for this event.
      const { viaDelegation } = await requireEventScope(prisma, user, eventId, 'manual_checkin')
      delegatedCheckout = viaDelegation
    } else {
      // Duty check-out for someone else stays staff-only (throws 403)
      authorizeManualCheckIn(user, userId)
    }
  }

  // Find the open record
  let openRecord
  if (eventId) {
    openRecord = await prisma.attendance.findFirst({
      where: { eventId, userId, checkOutAt: null }
    })
  } else {
    const { gte, lt } = manilaDayRange(new Date(dutyDate))
    openRecord = await prisma.attendance.findFirst({
      where: {
        userId,
        type: 'duty',
        dutyDate: { gte, lt },
        checkOutAt: null
      }
    })
  }

  if (!openRecord) {
    throw notFound('No open check-in record found. You may have already checked out.')
  }

  // Time-window enforcement for duty checkout only
  if (!eventId && dutyDate) {
    let orgProfile = await prisma.orgProfile.findFirst()
    if (!orgProfile) {
      orgProfile = await prisma.orgProfile.create({ data: {} })
    }

    const nowManila = manilaHHMM(new Date())
    if (nowManila < orgProfile.dutyCheckOutStart) {
      throw forbidden(`Duty check-out is only allowed starting ${orgProfile.dutyCheckOutStart}.`)
    }
  }

  // Set checkOutAt
  const updated = await prisma.attendance.update({
    where: { id: openRecord.id },
    data: { checkOutAt: new Date() },
    include: {
      user: { select: { id: true, name: true, position: true, role: true } }
    },
    omit: { photoKey: true, photoCapturedAt: true, photoExpiresAt: true }
  })

  if (delegatedCheckout && eventId) {
    await auditDelegationUse(prisma, user, eventId, 'manual_checkin', {
      attendanceId: updated.id,
      targetUserId: userId,
      action: 'checkout'
    })
  }

  return updated
})
