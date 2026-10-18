import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { attendedIds, expectedForEvent, rate, signatureRate } from '../../utils/analytics'
import { activeAudience, attendanceRows, eventsInWindow, registrationsByEvent, resolveSemester } from '../../utils/analytics-data'

/**
 * GET /api/analytics/events?semesterId= — one row per event: attended, expected,
 * rate and signature completion (plan §8.3). This is the table the dashboard
 * shows and the thing the phase's acceptance test reconciles with the export.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const query = getQuery(event)
  const window = await resolveSemester(prisma, typeof query.semesterId === 'string' ? query.semesterId : undefined)
  const events = await eventsInWindow(prisma, window)

  const eventIds = events.map(row => row.id)
  const [attendance, registrations, audience] = await Promise.all([
    attendanceRows(prisma, eventIds),
    registrationsByEvent(prisma, eventIds),
    activeAudience(prisma)
  ])

  return {
    semester: window.id ? { id: window.id, name: window.name } : null,
    events: events.map((row) => {
      const rows = attendance.filter(a => a.eventId === row.id)
      const attended = attendedIds(rows).size
      const expected = expectedForEvent({
        registrationRequired: row.registrationRequired,
        registrants: (registrations.get(row.id) ?? []).length,
        activeStudents: audience.length
      })
      return {
        id: row.id,
        title: row.title,
        date: row.date,
        category: row.category,
        expected,
        attended,
        rate: rate(attended, expected),
        signatures: {
          signed: rows.filter(a => a.hasSignature).length,
          rate: signatureRate(rows)
        }
      }
    })
  }
})
