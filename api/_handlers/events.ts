import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'

// ---------------------------------------------------------------------------
// GET/POST /api/events
// ---------------------------------------------------------------------------
export async function events(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    if (req.method === 'GET') {
      const eventsList = await prisma.event.findMany({
        orderBy: { date: 'desc' },
        include: {
          creator: { select: { id: true, name: true, position: true, role: true } },
          _count: { select: { attendance: true } },
        },
      })
      return res.status(200).json(eventsList)
    }

    if (req.method === 'POST') {
      requireStaff(user)

      const { title, date, lat, lng, radiusMeters } = req.body

      if (!title || !date || lat === undefined || lng === undefined) {
        return res.status(400).json({ error: 'Missing required fields: title, date, lat, lng' })
      }

      const event = await prisma.event.create({
        data: {
          title,
          date: new Date(date),
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          radiusMeters: radiusMeters ? parseInt(radiusMeters) : 50,
          createdBy: user.id,
        },
        include: {
          creator: { select: { id: true, name: true, position: true, role: true } },
        },
      })

      return res.status(201).json(event)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// GET/PUT/DELETE /api/events/:id
// ---------------------------------------------------------------------------
export async function eventById(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const user = await authenticate(req)

    if (req.method === 'GET') {
      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          creator: { select: { id: true, name: true, position: true, role: true } },
          attendance: {
            include: {
              user: { select: { id: true, name: true, position: true, role: true } },
              recorder: { select: { id: true, name: true, position: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })

      if (!event) {
        return res.status(404).json({ error: 'Event not found' })
      }

      return res.status(200).json(event)
    }

    if (req.method === 'PUT') {
      requireStaff(user)

      const { title, date, lat, lng, radiusMeters } = req.body

      const event = await prisma.event.update({
        where: { id },
        data: {
          ...(title && { title }),
          ...(date && { date: new Date(date) }),
          ...(lat !== undefined && { lat: parseFloat(lat) }),
          ...(lng !== undefined && { lng: parseFloat(lng) }),
          ...(radiusMeters !== undefined && { radiusMeters: parseInt(radiusMeters) }),
        },
      })

      return res.status(200).json(event)
    }

    if (req.method === 'DELETE') {
      requireStaff(user)

      await prisma.event.delete({ where: { id } })
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
