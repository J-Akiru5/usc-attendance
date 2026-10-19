import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { attendedIds, expectedForEvent, rate, signatureRate } from '../../utils/analytics'
import { attendanceRows, eventsInWindow, registrationsByEvent, resolveSemester } from '../../utils/analytics-data'
import { resolveAudiences, specFromEvent } from '../../utils/audience'
import { existingSnapshots } from '../../utils/expected-data'
import { frozenAt, frozenAudience } from '../../utils/expected'

/**
 * GET /api/analytics/events?semesterId= — one row per event: attended, expected,
 * rate and signature completion (plan §8.3). This is the table the dashboard
 * shows and the thing the phase's acceptance test reconciles with the export.
 *
 * A row whose `expected` came from the frozen roster (benchmark BC-4) carries
 * `frozenAt`; a row that had to resolve live carries `null`. That is what lets
 * the dashboard say "frozen at ‹time›" instead of implying the number is live.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const query = getQuery(event)
  const window = await resolveSemester(prisma, typeof query.semesterId === 'string' ? query.semesterId : undefined)
  const events = await eventsInWindow(prisma, window)

  const eventIds = events.map(row => row.id)
  const [attendance, registrations, snapshots] = await Promise.all([
    attendanceRows(prisma, eventIds),
    registrationsByEvent(prisma, eventIds),
    existingSnapshots(prisma, eventIds)
  ])

  const audiences = await resolveAudiences(
    prisma,
    events
      .filter(row => !row.registrationRequired && (snapshots.get(row.id)?.length ?? 0) === 0)
      .map(row => ({ key: row.id, spec: specFromEvent(row) }))
  )

  return {
    semester: window.id ? { id: window.id, name: window.name } : null,
    events: events.map((row) => {
      const rows = attendance.filter(a => a.eventId === row.id)
      const attended = attendedIds(rows).size
      const registrants = registrations.get(row.id) ?? []
      const frozen = snapshots.get(row.id) ?? []
      const frozenIds = row.registrationRequired ? null : frozenAudience(frozen)
      const expected = expectedForEvent({
        registrationRequired: row.registrationRequired,
        registrants: registrants.length,
        audienceSize: (frozenIds ?? audiences.get(row.id) ?? []).length
      })

      return {
        id: row.id,
        title: row.title,
        date: row.date,
        category: row.category,
        expected,
        attended,
        rate: rate(attended, expected),
        frozenAt: frozenIds ? frozenAt(frozen) : null,
        signatures: {
          signed: rows.filter(a => a.hasSignature).length,
          rate: signatureRate(rows)
        }
      }
    })
  }
})
