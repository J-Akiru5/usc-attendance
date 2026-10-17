import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, forbidden, isUniqueViolation, readJsonBody, respond } from '../../utils/http'
import { authorizeDutySelfCheckIn, authorizeManualCheckIn } from '../../utils/attendance-rules'
import { manilaDayRange, manilaDow, manilaHHMM } from '../../utils/time'

const ALREADY_CHECKED_IN = 'Already checked in. Check out before checking in again.'

// ---------------------------------------------------------------------------
// GET/POST /api/attendance/duty
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const routeMethod = getMethod(event)
  const user = await authenticate(event)

  // GET: list duty check-ins for a date
  if (routeMethod === 'GET') {
    const query = getQuery(event)
    const dateStr = query.date as string
    const date = dateStr ? new Date(dateStr) : new Date()
    const dayOfWeek = manilaDow(date)

    const duties = await prisma.officeDuty.findMany({
      where: { dayOfWeek, active: true },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } }
      }
    })

    // Get attendance records for that Manila day
    const { gte, lt } = manilaDayRange(date)
    const attendance = await prisma.attendance.findMany({
      where: {
        type: 'duty',
        dutyDate: { gte, lt }
      },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } },
        recorder: { select: { id: true, name: true, position: true } }
      }
    })

    return { duties, attendance }
  }

  // POST: check in for duty
  if (routeMethod === 'POST') {
    const { userId, lat, lng, dutyDate } = await readJsonBody(event) ?? {}

    if (!userId) {
      throw badRequest('userId is required')
    }

    const date = dutyDate ? new Date(dutyDate) : new Date()
    const dayOfWeek = manilaDow(date)

    // Verify officer has duty on that Manila day
    const dutyRecord = await prisma.officeDuty.findFirst({
      where: { userId, dayOfWeek, active: true }
    })

    if (!dutyRecord) {
      throw forbidden('No duty scheduled for today')
    }

    // Time-window enforcement: duty check-in cutoff (Manila wall clock)
    let orgProfile = await prisma.orgProfile.findFirst()
    if (!orgProfile) {
      orgProfile = await prisma.orgProfile.create({ data: {} })
    }

    const nowManila = manilaHHMM(new Date())
    if (nowManila >= orgProfile.dutyCheckInCutoff) {
      throw forbidden(`Duty check-in is only allowed before ${orgProfile.dutyCheckInCutoff}.`)
    }

    // Check for open (not-yet-checked-out) duty record that Manila day
    const { gte, lt } = manilaDayRange(date)
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

    // Who may record whom: self check-in is open; recording someone else is staff-only.
    // recordedBy is always the authenticated user, never from the body.
    let resolved: { lat: number | null, lng: number | null }
    let method: 'self' | 'manual'
    if (userId === user.id) {
      method = 'self'
      resolved = authorizeDutySelfCheckIn({ actor: user, targetUserId: userId, lat, lng })
    } else {
      method = 'manual'
      authorizeManualCheckIn(user, userId)
      resolved = { lat: null, lng: null }
    }

    try {
      const record = await prisma.attendance.create({
        data: {
          type: 'duty',
          dutyDate: date,
          userId,
          method,
          lat: resolved.lat,
          lng: resolved.lng,
          recordedBy: user.id
        },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } }
        }
      })

      return respond(event, 201, record)
    } catch (dbErr: unknown) {
      if (isUniqueViolation(dbErr)) {
        throw forbidden(ALREADY_CHECKED_IN)
      }
      throw dbErr
    }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
