import { getHeader, getMethod } from 'h3'
import { timingSafeEqual } from 'crypto'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, HttpError, respond } from '../../utils/http'
import { dedupeKeyFor, notifyMany, notifier, type NotifyInput } from '../../utils/notify'
import { resolveAudience, specFromEvent } from '../../utils/audience'
import { formatManila } from '../../utils/report'

/**
 * GET /api/cron/event-reminders — called hourly with CRON_SECRET (plan §8.4).
 * Reminds the people required at an event 24 hours and 1 hour before it starts.
 * Idempotent by construction: each reminder carries a dedupe key of the kind,
 * the window and the event, so running it twice (or five times) sends nothing
 * extra, and the quota guard still caps the email side.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const secret = process.env.CRON_SECRET
  if (!secret) throw new HttpError(503, 'CRON_SECRET is not configured')
  const given = Buffer.from(getHeader(event, 'authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, 'Unauthorized')
  }

  const now = new Date()
  const windows: Array<{ hours: number, label: string }> = [
    { hours: 24, label: 'tomorrow' },
    { hours: 1, label: 'in an hour' }
  ]

  const results: Array<{ eventId: string, window: string, sent: number, duplicates: number, emails: number }> = []

  for (const window of windows) {
    const from = new Date(now.getTime() + (window.hours - 0.25) * 3600_000)
    const to = new Date(now.getTime() + (window.hours + 0.25) * 3600_000)

    const events = await prisma.event.findMany({
      // Cancelled events are inert: no reminders for something that is not
      // happening (benchmark BC-7).
      where: { date: { gte: from, lte: to }, status: 'scheduled' },
      select: {
        id: true,
        title: true,
        date: true,
        lat: true,
        registrationRequired: true,
        audienceType: true,
        audienceCollegeId: true,
        audienceYearLevel: true,
        audienceSectionId: true
      }
    })

    for (const row of events) {
      // Who must attend: registrants when the event asks for registration,
      // otherwise the required audience — the same resolver the fines will use.
      const recipients = row.registrationRequired
        ? (await prisma.eventRegistration.findMany({ where: { eventId: row.id, status: 'registered' }, select: { userId: true } })).map(r => r.userId)
        : await resolveAudience(prisma, specFromEvent(row))

      if (recipients.length === 0) continue

      const inputs: NotifyInput[] = recipients.map(userId => ({
        userId,
        kind: 'event_reminder',
        title: `${row.title} is ${window.label}`,
        body: `${row.title} starts ${formatManila(row.date)}. Show your QR code at the venue — an officer will scan you in.`,
        link: '/dashboard',
        dedupeKey: dedupeKeyFor('event_reminder', `${window.hours}:${row.id}`)
      }))

      const outcome = await notifyMany(notifier(prisma), inputs)
      results.push({ eventId: row.id, window: `${window.hours}h`, ...outcome })
    }
  }

  return { ranAt: now.toISOString(), windows: results }
})
