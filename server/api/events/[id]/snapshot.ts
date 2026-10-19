import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { activeStudentPlacements, specFromEvent } from '../../../utils/audience'
import { existingSnapshots, snapshotStatus, writeSnapshot } from '../../../utils/expected-data'
import { planSnapshot, snapshotDue } from '../../../utils/expected'

/**
 * GET /api/events/:id/snapshot — what is frozen for this event, if anything.
 * POST /api/events/:id/snapshot — freeze the expected roster now, or re-freeze
 * it deliberately with `{ "refresh": true }` (benchmark BC-4).
 *
 * The automatic freeze happens in the fine cron when the window closes. This
 * route exists for the two cases that leaves: freezing a past event whose fines
 * were issued before the freeze existed, and deliberately adopting a corrected
 * audience/placement. A re-freeze is a real change only when the population
 * differs; an identical one writes nothing, keeps the original `snapshotAt`, and
 * therefore does not create an audit row.
 *
 * Staff only. Every actual freeze is audited (`event_expected_frozen`).
 */
export default defineApiHandler(async (event) => {
  const method = getMethod(event)
  if (method !== 'GET' && method !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const eventId = getRouterParam(event, 'id') ?? ''
  const row = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      status: true,
      date: true,
      checkInClosesAt: true,
      audienceType: true,
      audienceCollegeId: true,
      audienceYearLevel: true,
      audienceSectionId: true
    }
  })
  if (!row) throw new HttpError(404, 'Event not found')

  const now = new Date()
  const due = snapshotDue(row, now)

  if (method === 'GET') {
    const state = await snapshotStatus(prisma, eventId)
    return { eventId, ...state, due }
  }

  if (row.status === 'cancelled') {
    throw new HttpError(409, 'A cancelled event has no expected roster')
  }

  const body = await readJsonBody(event) ?? {}
  if (body.refresh !== undefined && typeof body.refresh !== 'boolean') {
    throw badRequest('refresh must be true or false')
  }
  const refresh = body.refresh === true

  const existing = (await existingSnapshots(prisma, [eventId])).get(eventId) ?? []

  // An existing snapshot is the roster. Without an explicit refresh there is
  // nothing to compute and nothing to write.
  if (existing.length > 0 && !refresh) {
    const state = await snapshotStatus(prisma, eventId)
    return {
      eventId,
      frozen: state.frozen,
      frozenAt: state.frozenAt,
      count: state.count,
      source: state.source,
      due,
      unchanged: true,
      written: false,
      created: 0,
      removed: 0,
      changed: 0
    }
  }

  const members = await activeStudentPlacements(prisma)
  const plan = planSnapshot({ eventId, spec: specFromEvent(row), members, existing, now })
  const written = await writeSnapshot(prisma, plan)
  const state = await snapshotStatus(prisma, eventId)

  if (written) {
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'event_expected_frozen',
        details: JSON.stringify({
          eventId,
          trigger: 'manual',
          refresh,
          source: plan.source,
          count: plan.audienceIds.length,
          created: plan.created.length,
          removed: plan.removed.length,
          changed: plan.changed.length,
          snapshotAt: state.frozenAt?.toISOString() ?? null
        }),
        performedBy: user.id
      }
    })
  }

  return {
    eventId,
    frozen: state.frozen,
    frozenAt: state.frozenAt,
    count: state.count,
    source: state.source,
    due,
    unchanged: plan.unchanged,
    written,
    created: plan.created.length,
    removed: plan.removed.length,
    changed: plan.changed.length
  }
})
