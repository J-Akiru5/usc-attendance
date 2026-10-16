import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'
import { badRequest, handle } from '../_lib/http.js'
import { hasEventScope } from '../_lib/delegation.js'

// ---------------------------------------------------------------------------
// GET/POST /api/events
// ---------------------------------------------------------------------------
export const events = handle(async (req: VercelRequest, res: VercelResponse) => {
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
      throw badRequest('Missing required fields: title, date, lat, lng')
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
})

// ---------------------------------------------------------------------------
// GET/PUT/DELETE /api/events/:id
// ---------------------------------------------------------------------------
export const eventById = handle(async (req: VercelRequest, res: VercelResponse, id: string) => {
  const user = await authenticate(req)

  if (req.method === 'GET') {
    // The attendance roster is only included for staff or a "view_roster" grant.
    const { allowed: canViewRoster } = await hasEventScope(prisma, user, id, 'view_roster')

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, position: true, role: true } },
        ...(canViewRoster && {
          attendance: {
            include: {
              user: { select: { id: true, name: true, position: true, role: true } },
              recorder: { select: { id: true, name: true, position: true } },
            },
            orderBy: { createdAt: 'desc' as const },
          },
        }),
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
})
