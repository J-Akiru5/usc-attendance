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
      const { eventId, userId, method, lat, lng, recordedBy } = req.body

      if (!eventId || !userId || !method || !recordedBy) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      // Check for duplicate (the @@unique constraint is the final guard,
      // but we check here for a better error message)
      const existing = await prisma.attendance.findUnique({
        where: { eventId_userId: { eventId, userId } },
      })

      if (existing) {
        return res.status(409).json({
          error: 'This officer has already checked in to this event',
        })
      }

      // Server-side distance validation for self check-ins
      if (method === 'self' && lat !== undefined && lng !== undefined) {
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

      // Staff can only do manual check-ins for others
      if (method === 'manual') {
        requireStaff(user)
      }

      const record = await prisma.attendance.create({
        data: {
          eventId,
          userId,
          method,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          recordedBy,
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
