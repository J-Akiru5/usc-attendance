import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, HttpError, respond } from '../../../utils/http'
import { hasEventScope } from '../../../utils/delegation'
import { seatsLeft } from '../../../utils/registrations'

/**
 * GET /api/events/:id/registrations — who is coming (plan §8.2): staff, or an
 * officer holding a `view_roster` grant for this event.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const eventId = getRouterParam(event, 'id') ?? ''

  const { allowed } = await hasEventScope(prisma, user, eventId, 'view_roster')
  if (!allowed) throw new HttpError(403, 'Access denied. Roster access required.')

  const eventRow = await prisma.event.findUnique({ where: { id: eventId }, select: { capacity: true } })
  if (!eventRow) throw new HttpError(404, 'Event not found')

  const rows = await prisma.eventRegistration.findMany({
    where: { eventId, status: { in: ['registered', 'waitlisted'] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      promotedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: { select: { studentNo: true, yearLevel: true } }
        }
      }
    }
  })

  const registered = rows.filter(r => r.status === 'registered').length
  return {
    capacity: eventRow.capacity,
    registered,
    waitlisted: rows.length - registered,
    seatsLeft: seatsLeft(eventRow.capacity, registered),
    registrations: rows
  }
})
