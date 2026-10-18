import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { requireEventScope } from '../../utils/delegation'
import { attendedIds, expectedForEvent, methodMix, noShows, rate, signatureRate } from '../../utils/analytics'
import { activeAudience, attendanceRows, eventsInWindow, registrationsByEvent, resolveSemester } from '../../utils/analytics-data'
import { resolveAudiences, specFromEvent } from '../../utils/audience'

/**
 * GET /api/analytics/overview?semesterId=&eventId= — the headline numbers
 * (plan §8.3). Staff see a semester (or everything); a delegate holding
 * `view_roster` for one event sees that event.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const query = getQuery(event)
  const eventId = typeof query.eventId === 'string' ? query.eventId : ''

  let events
  if (eventId) {
    await requireEventScope(prisma, user, eventId, 'view_roster')
    const window = { id: null, name: null, startsOn: null, endsOn: null }
    events = (await eventsInWindow(prisma, window)).filter(row => row.id === eventId)
  } else {
    requireStaff(user)
    const window = await resolveSemester(prisma, typeof query.semesterId === 'string' ? query.semesterId : undefined)
    events = await eventsInWindow(prisma, window)
  }

  const eventIds = events.map(row => row.id)
  const [attendance, registrations, audience] = await Promise.all([
    attendanceRows(prisma, eventIds),
    registrationsByEvent(prisma, eventIds),
    activeAudience(prisma)
  ])

  const attended = attendedIds(attendance)
  const audiences = await resolveAudiences(prisma, events.map(row => ({ key: row.id, spec: specFromEvent(row) })))

  const byEvent = events.map((row) => {
    const rows = attendance.filter(a => a.eventId === row.id)
    const registrants = registrations.get(row.id) ?? []
    return {
      id: row.id,
      expected: expectedForEvent({
        registrationRequired: row.registrationRequired,
        registrants: registrants.length,
        audienceSize: audiences.get(row.id)?.length ?? audience.length
      }),
      attended: attendedIds(rows).size,
      signatures: rows.filter(a => a.hasSignature).length
    }
  })

  const expected = byEvent.reduce((sum, row) => sum + row.expected, 0)
  const attendedTotal = new Set(attendance.map(row => row.userId)).size

  return {
    scope: eventId ? { type: 'event', id: eventId } : { type: 'semester', id: null },
    events: events.length,
    expected,
    attended: attendedTotal,
    rate: rate(attendedTotal, expected),
    signatures: {
      signed: attendance.filter(row => row.hasSignature).length,
      rate: signatureRate(attendance)
    },
    methods: methodMix(attendance),
    noShows: events.length === 1
      ? noShows(registrations.get(eventId) ?? [], attended).length
      : noShows(audience.map(member => member.userId), attended).length
  }
})
