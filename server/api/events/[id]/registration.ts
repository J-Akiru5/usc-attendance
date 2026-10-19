import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { badRequest, defineApiHandler, notFound, respond } from '../../../utils/http'
import { cancelRegistration, registerForEvent, seatsLeft } from '../../../utils/registrations'
import { notifyUser, dedupeKeyFor, notifier } from '../../../utils/notify'
import { assertEventActive } from '../../../utils/cancellation'
import { auditContext, auditWrite } from '../../../utils/audit'

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
    select: { id: true, capacity: true, registrationRequired: true, status: true, title: true }
  })
  if (!eventRow) throw notFound('Event not found')

  // A cancelled event takes no registrations either (benchmark BC-7).
  assertEventActive(eventRow)

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
    await auditWrite(prisma, {
      actor: user,
      action: result.status === 'registered' ? 'event_registration_created' : 'event_registration_waitlisted',
      targetType: 'event',
      targetId: eventId,
      userId: user.id,
      details: { status: result.status, position: result.position },
      ...auditContext(event)
    })

    // Tell them where they stand (plan §8.4). Best effort: a mail problem must
    // never fail the registration itself.
    const eventRowFull = await prisma.event.findUnique({ where: { id: eventId }, select: { title: true, date: true } })
    await notifyUser(notifier(prisma), {
      userId: user.id,
      kind: result.status === 'registered' ? 'registration_confirmed' : 'waitlist_joined',
      title: result.status === 'registered'
        ? `You're registered for ${eventRowFull?.title ?? 'the event'}`
        : `You're on the waitlist for ${eventRowFull?.title ?? 'the event'}`,
      body: result.status === 'registered'
        ? `You hold a seat for ${eventRowFull?.title ?? 'the event'}. Show your QR code at the venue.`
        : `All seats are taken, so you are number ${result.position ?? '?'} in line. You will get a seat automatically if one frees up.`,
      link: '/dashboard'
    }).catch(() => {})
    return respond(event, 201, { ...result, capacity: eventRow.capacity, seatsLeft: await seats() })
  }

  if (method === 'DELETE') {
    const result = await cancelRegistration(prisma, { eventId, userId: user.id, capacity: eventRow.capacity })
    if (!result.cancelled) throw notFound('You are not registered for this event')

    await auditWrite(prisma, {
      actor: user,
      action: 'event_registration_cancelled',
      targetType: 'event',
      targetId: eventId,
      userId: user.id,
      // The promoted person's id is not copied here: the promotion is theirs,
      // and the registration row already records it.
      details: { promoted: !!result.promotedUserId },
      ...auditContext(event)
    })

    // Somebody just moved up (plan §8.4). Best effort, like the confirmation.
    if (result.promotedUserId) {
      await notifyUser(notifier(prisma), {
        userId: result.promotedUserId,
        kind: 'waitlist_promoted',
        title: 'A seat opened up',
        body: 'You moved up from the waitlist and now hold a seat. Show your QR code at the venue.',
        link: '/dashboard',
        dedupeKey: dedupeKeyFor('waitlist_promoted', eventId)
      }).catch(() => {})
    }
    return { cancelled: true, promoted: !!result.promotedUserId, capacity: eventRow.capacity, seatsLeft: await seats() }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
