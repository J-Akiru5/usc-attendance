import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { cancellationBlockedReason, cancellationNotice } from '../../../utils/cancellation'
import { resolveAudience, specFromEvent } from '../../../utils/audience'
import { notifier, notifyMany, dedupeKeyFor } from '../../../utils/notify'
import { auditContext, auditWrite } from '../../../utils/audit'

/**
 * POST /api/events/:id/cancel — call an event off (plan §8.5 / benchmark BC-7).
 *
 * Staff only, and one-way. The audience is told, and from that moment the event
 * is inert: no reminders, no check-ins, no registration, no fines. That matters
 * most for the fines: without this, a rained-out assembly would bill everyone
 * who stayed home.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const eventId = getRouterParam(event, 'id') ?? ''
  const row = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      status: true,
      registrationRequired: true,
      audienceType: true,
      audienceCollegeId: true,
      audienceYearLevel: true,
      audienceSectionId: true
    }
  })
  if (!row) throw new HttpError(404, 'Event not found')

  const blocked = cancellationBlockedReason(row)
  if (blocked) throw new HttpError(409, blocked)

  const body = await readJsonBody(event) ?? {}
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null

  const cancelled = await prisma.event.update({
    where: { id: eventId },
    data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: user.id, cancelReason: reason }
  })

  await auditWrite(prisma, {
    actor: user,
    action: 'event_cancelled',
    targetType: 'event',
    targetId: eventId,
    details: { reason },
    ...auditContext(event)
  })

  // Tell the people who were expected — registrants when the event took
  // registrations, otherwise its required audience. Best effort: a mail problem
  // must never leave the cancellation itself half-done.
  const recipients = row.registrationRequired
    ? (await prisma.eventRegistration.findMany({ where: { eventId, status: { in: ['registered', 'waitlisted'] } }, select: { userId: true } })).map(r => r.userId)
    : await resolveAudience(prisma, specFromEvent(row))

  const notified = recipients.length === 0
    ? { sent: 0, duplicates: 0, emails: 0 }
    : await notifyMany(notifier(prisma), recipients.map(userId => ({
        userId,
        kind: 'event_cancelled',
        title: `${row.title} was cancelled`,
        body: cancellationNotice(row.title, reason),
        link: '/dashboard',
        dedupeKey: dedupeKeyFor('event_cancelled', eventId)
      })))

  return { event: { id: cancelled.id, status: cancelled.status, cancelledAt: cancelled.cancelledAt, cancelReason: cancelled.cancelReason }, notified: recipients.length, ...notified }
})
