import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, noContent, readJsonBody, respond } from '../../utils/http'
import { hasEventScope } from '../../utils/delegation'

// ---------------------------------------------------------------------------
// GET/PUT/DELETE /api/events/:id
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const id = getRouterParam(event, 'id') ?? ''

  if (getMethod(event) === 'GET') {
    // The attendance roster is only included for staff or a "view_roster" grant.
    const { allowed: canViewRoster } = await hasEventScope(prisma, user, id, 'view_roster')

    const eventRow = await prisma.event.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, position: true, role: true } },
        ...(canViewRoster && {
          attendance: {
            include: {
              user: { select: { id: true, name: true, position: true, role: true } },
              recorder: { select: { id: true, name: true, position: true } }
            },
            orderBy: { createdAt: 'desc' as const }
          }
        })
      }
    })

    if (!eventRow) {
      return respond(event, 404, { error: 'Event not found' })
    }

    return eventRow
  }

  if (getMethod(event) === 'PUT') {
    requireStaff(user)

    const { title, date, lat, lng, radiusMeters } = await readJsonBody(event) ?? {}

    const eventRow = await prisma.event.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(date && { date: new Date(date) }),
        ...(lat !== undefined && { lat: parseFloat(lat) }),
        ...(lng !== undefined && { lng: parseFloat(lng) }),
        ...(radiusMeters !== undefined && { radiusMeters: parseInt(radiusMeters) })
      }
    })

    return eventRow
  }

  if (getMethod(event) === 'DELETE') {
    requireStaff(user)

    await prisma.event.delete({ where: { id } })
    return noContent(event, 204)
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
