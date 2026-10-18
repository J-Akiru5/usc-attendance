import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { requireEventScope } from '../../utils/delegation'
import { peakHour, timingHistogram } from '../../utils/analytics'
import { attendanceRows, eventsInWindow, resolveSemester } from '../../utils/analytics-data'

/**
 * GET /api/analytics/timing?semesterId=|eventId= — check-ins per Manila hour
 * (plan §8.3's "check-in timing histogram"), the thing that tells the USC
 * whether a 7:30 flag ceremony really starts at 7:30.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const query = getQuery(event)
  const eventId = typeof query.eventId === 'string' ? query.eventId : ''

  let eventIds: string[]
  if (eventId) {
    await requireEventScope(prisma, user, eventId, 'view_roster')
    eventIds = [eventId]
  } else {
    requireStaff(user)
    const window = await resolveSemester(prisma, typeof query.semesterId === 'string' ? query.semesterId : undefined)
    eventIds = (await eventsInWindow(prisma, window)).map(row => row.id)
  }

  const rows = await attendanceRows(prisma, eventIds)
  const buckets = timingHistogram(rows)

  return {
    scope: eventId ? { type: 'event', id: eventId } : { type: 'semester', id: null },
    total: rows.length,
    peakHour: peakHour(buckets),
    buckets
  }
})
