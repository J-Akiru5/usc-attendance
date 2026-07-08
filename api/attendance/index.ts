import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { authenticate, requireStaff } from '../_lib/auth'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

      // Check for duplicate
      if (attendanceType === 'event') {
        const existing = await prisma.attendance.findUnique({
          where: { eventId_userId: { eventId, userId } },
        })

        if (existing) {
          return res.status(409).json({
            error: 'This officer has already checked in to this event',
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
          },
        })

        if (existing) {
          return res.status(409).json({
            error: 'Already checked in for duty today',
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
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
