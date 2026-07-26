import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'
import { createHmac, timingSafeEqual } from 'crypto'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function manilaHHMM(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hh}:${mm}`
}

const QR_SECRET = process.env.QR_SECRET || 'usc-attendance-qr-secret-change-in-prod'

function signQr(userId: string, eventId: string, issuedAt: number): string {
  const data = `${userId}:${eventId}:${issuedAt}`
  return createHmac('sha256', QR_SECRET).update(data).digest('hex')
}

// ---------------------------------------------------------------------------
// GET/POST /api/attendance
// ---------------------------------------------------------------------------
export async function index(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    if (req.method === 'GET') {
      const eventId = req.query.eventId as string
      if (!eventId) {
        return res.status(400).json({ error: 'eventId query parameter is required' })
      }

      const records = await prisma.attendance.findMany({
        where: { eventId },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
          recorder: { select: { id: true, name: true, position: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      return res.status(200).json(records)
    }

    if (req.method === 'POST') {
      const { type, eventId, dutyDate, userId, method, lat, lng } = req.body

      if (!userId || !method) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const attendanceType = type || 'event'

      if (attendanceType === 'event' && !eventId) {
        return res.status(400).json({ error: 'eventId is required for event check-ins' })
      }

      if (attendanceType === 'duty' && !dutyDate) {
        return res.status(400).json({ error: 'dutyDate is required for duty check-ins' })
      }

      // Check for open (not-yet-checked-out) record
      if (attendanceType === 'event') {
        const existing = await prisma.attendance.findFirst({
          where: { eventId, userId, checkOutAt: null },
        })

        if (existing) {
          return res.status(409).json({
            error: 'Already checked in. Check out before checking in again.',
          })
        }
      }

      if (attendanceType === 'duty') {
        const date = new Date(dutyDate)
        const todayStart = new Date(date)
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date(date)
        todayEnd.setHours(23, 59, 59, 999)

        const existing = await prisma.attendance.findFirst({
          where: {
            userId,
            type: 'duty',
            dutyDate: { gte: todayStart, lte: todayEnd },
            checkOutAt: null,
          },
        })

        if (existing) {
          return res.status(409).json({
            error: 'Already checked in. Check out before checking in again.',
          })
        }
      }

      // Server-side distance validation for self check-ins
      if (method === 'self' && lat !== undefined && lng !== undefined && attendanceType === 'event') {
        const event = await prisma.event.findUnique({ where: { id: eventId } })
        if (!event) {
          return res.status(404).json({ error: 'Event not found' })
        }

        const distance = haversine(lat, lng, event.lat, event.lng)
        if (distance > event.radiusMeters) {
          return res.status(403).json({
            error: `You are ${Math.round(distance)}m from the venue. Must be within ${event.radiusMeters}m to check in.`,
          })
        }
      }

      // Staff can only do manual/qr check-ins
      if (method === 'manual' || method === 'qr') {
        requireStaff(user)
      }

      // Guard: staff cannot manually record their own attendance
      if (method === 'manual' && user.id === userId) {
        return res.status(403).json({
          error: 'Staff cannot manually record their own attendance. Use self check-in (geolocation) or QR instead.',
        })
      }

      // recordedBy is always the authenticated user, never from client input
      try {
        const record = await prisma.attendance.create({
          data: {
            type: attendanceType,
            eventId: attendanceType === 'event' ? eventId : null,
            dutyDate: attendanceType === 'duty' ? new Date(dutyDate) : null,
            userId,
            method,
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null,
            recordedBy: user.id,
          },
          include: {
            user: { select: { id: true, name: true, position: true, role: true } },
          },
        })

        return res.status(201).json(record)
      } catch (dbErr: unknown) {
        // P2002 = Prisma unique constraint violation (race condition fallback from partial unique index)
        if (dbErr && typeof dbErr === 'object' && 'code' in dbErr && (dbErr as { code: string }).code === 'P2002') {
          return res.status(409).json({
            error: 'Already checked in. Check out before checking in again.',
          })
        }
        throw dbErr
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// POST /api/attendance/checkout
// ---------------------------------------------------------------------------
export async function checkout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req)
    const { eventId, dutyDate, userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    if (!eventId && !dutyDate) {
      return res.status(400).json({ error: 'Either eventId or dutyDate is required' })
    }

    // Determine self-checkout vs manual checkout
    const isSelf = user.id === userId
    if (!isSelf) {
      // Manual checkout — require staff role
      requireStaff(user)
    }

    // Find the open record
    let openRecord
    if (eventId) {
      openRecord = await prisma.attendance.findFirst({
        where: { eventId, userId, checkOutAt: null },
      })
    } else {
      const date = new Date(dutyDate)
      const todayStart = new Date(date)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(date)
      todayEnd.setHours(23, 59, 59, 999)

      openRecord = await prisma.attendance.findFirst({
        where: {
          userId,
          type: 'duty',
          dutyDate: { gte: todayStart, lte: todayEnd },
          checkOutAt: null,
        },
      })
    }

    if (!openRecord) {
      return res.status(404).json({ error: 'No open check-in record found. You may have already checked out.' })
    }

    // Time-window enforcement for duty checkout only
    if (!eventId && dutyDate) {
      let orgProfile = await prisma.orgProfile.findFirst()
      if (!orgProfile) {
        orgProfile = await prisma.orgProfile.create({ data: {} })
      }

      const nowManila = manilaHHMM(new Date())
      if (nowManila < orgProfile.dutyCheckOutStart) {
        return res.status(403).json({
          error: `Duty check-out is only allowed starting ${orgProfile.dutyCheckOutStart}.`,
        })
      }
    }

    // Set checkOutAt
    const updated = await prisma.attendance.update({
      where: { id: openRecord.id },
      data: { checkOutAt: new Date() },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } },
      },
    })

    return res.status(200).json(updated)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// GET/POST /api/attendance/duty
// ---------------------------------------------------------------------------
export async function duty(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    // GET: list duty check-ins for a date
    if (req.method === 'GET') {
      const dateStr = req.query.date as string
      const date = dateStr ? new Date(dateStr) : new Date()
      const dayOfWeek = date.getDay()

      const duties = await prisma.officeDuty.findMany({
        where: { dayOfWeek, active: true },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
        },
      })

      // Get attendance records for today's duty
      const todayStart = new Date(date)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(date)
      todayEnd.setHours(23, 59, 59, 999)

      const attendance = await prisma.attendance.findMany({
        where: {
          type: 'duty',
          dutyDate: { gte: todayStart, lte: todayEnd },
        },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
          recorder: { select: { id: true, name: true, position: true } },
        },
      })

      return res.status(200).json({ duties, attendance })
    }

    // POST: check in for duty
    if (req.method === 'POST') {
      const { userId, lat, lng, recordedBy, dutyDate } = req.body

      if (!userId || !recordedBy) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const date = dutyDate ? new Date(dutyDate) : new Date()
      const dayOfWeek = date.getDay()

      // Verify officer has duty today
      const dutyRecord = await prisma.officeDuty.findFirst({
        where: { userId, dayOfWeek, active: true },
      })

      if (!dutyRecord) {
        return res.status(403).json({ error: 'No duty scheduled for today' })
      }

      // Time-window enforcement: duty check-in cutoff
      let orgProfile = await prisma.orgProfile.findFirst()
      if (!orgProfile) {
        orgProfile = await prisma.orgProfile.create({ data: {} })
      }

      const nowManila = manilaHHMM(new Date())
      if (nowManila >= orgProfile.dutyCheckInCutoff) {
        return res.status(403).json({
          error: `Duty check-in is only allowed before ${orgProfile.dutyCheckInCutoff}.`,
        })
      }

      // Check for open (not-yet-checked-out) duty record today
      const todayStart = new Date(date)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(date)
      todayEnd.setHours(23, 59, 59, 999)

      const existing = await prisma.attendance.findFirst({
        where: {
          userId,
          type: 'duty',
          dutyDate: { gte: todayStart, lte: todayEnd },
          checkOutAt: null,
        },
      })

      if (existing) {
        return res.status(409).json({ error: 'Already checked in. Check out before checking in again.' })
      }

      // Server-side distance validation for self check-ins
      if (lat !== undefined && lng !== undefined) {
        requireStaff(user)
      }

      try {
        const record = await prisma.attendance.create({
          data: {
            type: 'duty',
            dutyDate: date,
            userId,
            method: lat !== undefined ? 'self' : 'manual',
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null,
            recordedBy,
          },
          include: {
            user: { select: { id: true, name: true, position: true, role: true } },
          },
        })

        return res.status(201).json(record)
      } catch (dbErr: unknown) {
        if (dbErr && typeof dbErr === 'object' && 'code' in dbErr && (dbErr as { code: string }).code === 'P2002') {
          return res.status(409).json({ error: 'Already checked in. Check out before checking in again.' })
        }
        throw dbErr
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// GET /api/attendance/export
// ---------------------------------------------------------------------------
export async function exportCsv(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req)
    requireStaff(user)

    const eventId = req.query.eventId as string
    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required' })
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const records = await prisma.attendance.findMany({
      where: { eventId },
      include: {
        user: { select: { name: true, position: true } },
        recorder: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const header = 'Name,Position,Method,Latitude,Longitude,Recorded By,Checked In At,Checked Out At\n'
    const rows = records
      .map((r: { user: { name: string; position: string }; method: string; lat: number | null; lng: number | null; recorder: { name: string }; createdAt: Date; checkOutAt: Date | null }) =>
        [
          `"${r.user.name}"`,
          `"${r.user.position}"`,
          r.method,
          r.lat ?? '',
          r.lng ?? '',
          `"${r.recorder.name}"`,
          r.createdAt.toISOString(),
          r.checkOutAt ? r.checkOutAt.toISOString() : '',
        ].join(',')
      )
      .join('\n')

    const csv = header + rows

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${event.title.replace(/[^a-zA-Z0-9 ]/g, '')}-attendance.csv"`
    )

    return res.status(200).send(csv)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// POST /api/attendance/qr
// ---------------------------------------------------------------------------
export async function qr(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    if (req.method === 'POST') {
      const { userId, eventId, recordedBy } = req.body

      if (!userId || !eventId || !recordedBy) {
        return res.status(400).json({ error: 'Missing required fields: userId, eventId, recordedBy' })
      }

      // Get the QR token from the request body
      const { issuedAt, exp, sig } = req.body

      if (!issuedAt || !exp || !sig) {
        return res.status(400).json({ error: 'Missing QR token fields' })
      }

      // Verify signature
      const expectedSig = signQr(userId, eventId, issuedAt)
      const expectedBuf = Buffer.from(expectedSig, 'hex')
      const actualBuf = Buffer.from(sig, 'hex')

      if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
        return res.status(403).json({ error: 'Invalid QR code signature' })
      }

      // Verify expiry
      const now = Math.floor(Date.now() / 1000)
      if (now > exp) {
        return res.status(403).json({ error: 'QR code has expired' })
      }

      // Check for open (not-yet-checked-out) record
      const existing = await prisma.attendance.findFirst({
        where: { eventId, userId, checkOutAt: null },
      })

      if (existing) {
        return res.status(409).json({ error: 'Already checked in. Check out before checking in again.' })
      }

      // QR scan requires staff
      requireStaff(user)

      try {
        const record = await prisma.attendance.create({
          data: {
            type: 'event',
            eventId,
            userId,
            method: 'qr',
            recordedBy,
          },
          include: {
            user: { select: { id: true, name: true, position: true, role: true } },
          },
        })

        return res.status(201).json(record)
      } catch (dbErr: unknown) {
        if (dbErr && typeof dbErr === 'object' && 'code' in dbErr && (dbErr as { code: string }).code === 'P2002') {
          return res.status(409).json({ error: 'Already checked in. Check out before checking in again.' })
        }
        throw dbErr
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
