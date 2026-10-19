import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { requireEventScope } from '../../utils/delegation'
import { attendedIds, expectedForEvent, methodMix, noShows, rate, signatureRate } from '../../utils/analytics'
import { attendanceRows, eventsInWindow, registrationsByEvent, resolveSemester } from '../../utils/analytics-data'
import { resolveAudiences, specFromEvent } from '../../utils/audience'
import { existingSnapshots } from '../../utils/expected-data'
import { frozenAt, frozenAudience } from '../../utils/expected'

/**
 * GET /api/analytics/overview?semesterId=&eventId= — the headline numbers
 * (plan §8.3). Staff see a semester (or everything); a delegate holding
 * `view_roster` for one event sees that event.
 *
 * "Expected" comes from the frozen roster when one exists (benchmark BC-4), and
 * from a live resolve only for an event that has never been frozen. The response
 * says which via `frozenAt`, so the dashboard can show "frozen at ‹time›".
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
  const [attendance, registrations, snapshots] = await Promise.all([
    attendanceRows(prisma, eventIds),
    registrationsByEvent(prisma, eventIds),
    existingSnapshots(prisma, eventIds)
  ])

  // Only events without a frozen roster need the live resolver. Events that take
  // registrations count their registrants, so they never need it for "expected".
  const audiences = await resolveAudiences(
    prisma,
    events
      .filter(row => !row.registrationRequired && (snapshots.get(row.id)?.length ?? 0) === 0)
      .map(row => ({ key: row.id, spec: specFromEvent(row) }))
  )

  const attended = attendedIds(attendance)
  const expectedIdsByEvent = new Map<string, string[]>()

  const byEvent = events.map((row) => {
    const rows = attendance.filter(a => a.eventId === row.id)
    const registrants = registrations.get(row.id) ?? []
    const frozen = snapshots.get(row.id) ?? []
    const frozenIds = row.registrationRequired ? null : frozenAudience(frozen)
    const expectedIds = row.registrationRequired ? registrants : (frozenIds ?? audiences.get(row.id) ?? [])
    expectedIdsByEvent.set(row.id, expectedIds)

    return {
      id: row.id,
      expected: expectedForEvent({
        registrationRequired: row.registrationRequired,
        registrants: registrants.length,
        audienceSize: expectedIds.length
      }),
      attended: attendedIds(rows).size,
      signatures: rows.filter(a => a.hasSignature).length,
      frozenAt: frozenIds ? frozenAt(frozen) : null
    }
  })

  const expected = byEvent.reduce((sum, row) => sum + row.expected, 0)
  const attendedTotal = new Set(attendance.map(row => row.userId)).size
  const frozenTimes = byEvent.map(row => row.frozenAt).filter((value): value is Date => value !== null)
  const frozenMoment = frozenTimes.length > 0
    ? new Date(Math.max(...frozenTimes.map(value => value.getTime())))
    : null

  // "Never appeared" is measured against the same populations the rows count —
  // the union of everyone expected at least once in the window.
  const expectedUnion = new Set<string>()
  for (const ids of expectedIdsByEvent.values()) {
    for (const id of ids) expectedUnion.add(id)
  }

  return {
    scope: eventId ? { type: 'event', id: eventId } : { type: 'semester', id: null },
    events: events.length,
    expected,
    attended: attendedTotal,
    rate: rate(attendedTotal, expected),
    /** The latest freeze time among the counts above, or null when none is frozen. */
    frozenAt: frozenMoment,
    frozenEvents: frozenTimes.length,
    signatures: {
      signed: attendance.filter(row => row.hasSignature).length,
      rate: signatureRate(attendance)
    },
    methods: methodMix(attendance),
    noShows: noShows([...expectedUnion], attended).length
  }
})
