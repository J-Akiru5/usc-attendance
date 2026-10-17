import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, readJsonBody, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET/POST /api/events
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)

  if (getMethod(event) === 'GET') {
    const eventsList = await prisma.event.findMany({
      orderBy: { date: 'desc' },
      include: {
        creator: { select: { id: true, name: true, position: true, role: true } },
        _count: { select: { attendance: true } }
      }
    })
    return eventsList
  }

  if (getMethod(event) === 'POST') {
    requireStaff(user)

    const { title, date, lat, lng, radiusMeters } = await readJsonBody(event) ?? {}

    if (!title || !date || lat === undefined || lng === undefined) {
      throw badRequest('Missing required fields: title, date, lat, lng')
    }

    const eventRow = await prisma.event.create({
      data: {
        title,
        date: new Date(date),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        radiusMeters: radiusMeters ? parseInt(radiusMeters) : 50,
        createdBy: user.id
      },
      include: {
        creator: { select: { id: true, name: true, position: true, role: true } }
      }
    })

    return respond(event, 201, eventRow)
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
