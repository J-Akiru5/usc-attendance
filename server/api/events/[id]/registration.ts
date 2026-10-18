import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { badRequest, defineApiHandler, notFound, respond } from '../../../utils/http'
import { cancelRegistration, registerForEvent, seatsLeft } from '../../../utils/registrations'

/**
 * /api/events/:id/registration — the caller's own place at an event (plan §8.2).
 *   GET    where they stand (status, seats left)
 *   POST   take a seat, or join the waitlist when the event is full
 *   DELETE give the seat up — the oldest waitlisted person is promoted
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const eventId = getRouterParam(event, 'id') ?? ''
  const method = getMethod(event)

  const eventRow = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, capacity: true, registrationRequired: true }
  })
  if (!eventRow) throw notFound('Event not found')

  const seats = async () => {
    const registered = await prisma.eventRegistration.count({ where: { eventId, status: 'registered' } })
    return seatsLeft(eventRow.capacity, registered)
  }

  if (method === 'GET') {
    const registration = await prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
      select: { status: true, createdAt: true, promotedAt: true }
    })
    return { registration, capacity: eventRow.capacity, seatsLeft: await seats() }
  }

  if (method === 'POST') {
    if (!eventRow.registrationRequired) throw badRequest('This event does not take registrations')

    const result = await registerForEvent(prisma, { eventId, userId: user.id, capacity: eventRow.capacity })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: result.status === 'registered' ? 'event_registration_created' : 'event_registration_waitlisted',
        details: JSON.stringify({ eventId, status: result.status, position: result.position }),
        performedBy: user.id
      }
    })
    return respond(event, 201, { ...result, capacity: eventRow.capacity, seatsLeft: await seats() })
  }

  if (method === 'DELETE') {
    const result = await cancelRegistration(prisma, { eventId, userId: user.id, capacity: eventRow.capacity })
    if (!result.cancelled) throw notFound('You are not registered for this event')

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'event_registration_cancelled',
        details: JSON.stringify({ eventId, promoted: result.promotedUserId }),
        performedBy: user.id
      }
    })
    return { cancelled: true, promoted: !!result.promotedUserId, capacity: eventRow.capacity, seatsLeft: await seats() }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
