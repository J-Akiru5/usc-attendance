import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, noContent, notFound, readJsonBody, respond } from '../../utils/http'
import { hasEventScope } from '../../utils/delegation'

/** The calendar/registration fields (plan §8.2) an update may carry. */
async function parseExtras(body: Record<string, unknown>) {
  const data: { categoryId?: string | null, capacity?: number | null, registrationRequired?: boolean } = {}

  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === '') {
      data.categoryId = null
    } else {
      if (typeof body.categoryId !== 'string') throw badRequest('categoryId must be text')
      const category = await prisma.eventCategory.findUnique({ where: { id: body.categoryId } })
      if (!category) throw notFound('Event category not found')
      if (category.archived) throw badRequest('That event category is archived')
      data.categoryId = category.id
    }
  }

  if (body.capacity !== undefined) {
    if (body.capacity === null || body.capacity === '') {
      data.capacity = null
    } else {
      const value = Number(body.capacity)
      if (!Number.isInteger(value) || value < 1 || value > 100000) {
        throw badRequest('Capacity must be a whole number of at least 1 (or empty for unlimited)')
      }
      data.capacity = value
    }
  }

  if (body.registrationRequired !== undefined) data.registrationRequired = body.registrationRequired === true

  return data
}

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
        category: { select: { id: true, code: true, name: true, color: true } },
        _count: { select: { attendance: true } },
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

    const body = await readJsonBody(event) ?? {}
    const { title, date, lat, lng, radiusMeters } = body
    const extras = await parseExtras(body)

    const eventRow = await prisma.event.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(date && { date: new Date(date) }),
        ...(lat !== undefined && { lat: parseFloat(lat) }),
        ...(lng !== undefined && { lng: parseFloat(lng) }),
        ...(radiusMeters !== undefined && { radiusMeters: parseInt(radiusMeters) }),
        ...extras
      },
      include: {
        creator: { select: { id: true, name: true, position: true, role: true } },
        category: { select: { id: true, code: true, name: true, color: true } },
        _count: { select: { attendance: true } }
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
