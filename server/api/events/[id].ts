import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, noContent, notFound, readJsonBody, respond } from '../../utils/http'
import { hasEventScope } from '../../utils/delegation'
import { planOccurrences, syncOccurrences, type SeriesTemplate } from '../../utils/event-series'
import { audienceColumns, parseAudience, specFromEvent } from '../../utils/audience'

/** The calendar/registration fields (plan §8.2) an update may carry. */
async function parseExtras(body: Record<string, unknown>) {
  const data: { categoryId?: string | null, capacity?: number | null, registrationRequired?: boolean } = {}

  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === '') {
      data.categoryId = null
    } else {
      if (typeof body.categoryId !== 'string') throw badRequest('categoryId must be text')
      const category = await prisma.eventCategory.findUnique({ where: { id: body.categoryId } })
      if (!category) throw notFound('Event category not found')
      if (category.archived) throw badRequest('That event category is archived')
      data.categoryId = category.id
    }
  }

  if (body.capacity !== undefined) {
    if (body.capacity === null || body.capacity === '') {
      data.capacity = null
    } else {
      const value = Number(body.capacity)
      if (!Number.isInteger(value) || value < 1 || value > 100000) {
        throw badRequest('Capacity must be a whole number of at least 1 (or empty for unlimited)')
      }
      data.capacity = value
    }
  }

  if (body.registrationRequired !== undefined) data.registrationRequired = body.registrationRequired === true

  return data
}

// ---------------------------------------------------------------------------
// GET/PUT/DELETE /api/events/:id
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const id = getRouterParam(event, 'id') ?? ''

  if (getMethod(event) === 'GET') {
    // The attendance roster is only included for staff or a "view_roster" grant.
    const { allowed: canViewRoster } = await hasEventScope(prisma, user, id, 'view_roster')

    const eventRow = await prisma.event.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, position: true, role: true } },
        category: { select: { id: true, code: true, name: true, color: true } },
        _count: { select: { attendance: true, occurrences: true } },
        // Required audience (plan §8.2) with the labels the page shows.
        audienceCollege: { select: { id: true, code: true, name: true } },
        audienceSection: { select: { id: true, name: true } },
        // Recurring series (plan §8.2): a master carries the rule, an instance
        // points back at the master.
        series: { select: { id: true, date: true, rrule: true, _count: { select: { occurrences: true } } } },
        ...(canViewRoster && {
          attendance: {
            include: {
              user: { select: { id: true, name: true, position: true, role: true } },
              recorder: { select: { id: true, name: true, position: true } }
            },
            orderBy: { createdAt: 'desc' as const }
          }
        })
      }
    })

    if (!eventRow) {
      return respond(event, 404, { error: 'Event not found' })
    }

    return eventRow
  }

  if (getMethod(event) === 'PUT') {
    requireStaff(user)

    const body = await readJsonBody(event) ?? {}
    const { title, date, lat, lng, radiusMeters } = body
    const extras = await parseExtras(body)

    const existing = await prisma.event.findUnique({
      where: { id },
      select: { audienceType: true, audienceCollegeId: true, audienceYearLevel: true, audienceSectionId: true }
    })
    const audience = await parseAudience(prisma, body, existing ? specFromEvent(existing) : undefined)

    const eventRow = await prisma.event.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(date && { date: new Date(date) }),
        ...(lat !== undefined && { lat: parseFloat(lat) }),
        ...(lng !== undefined && { lng: parseFloat(lng) }),
        ...(radiusMeters !== undefined && { radiusMeters: parseInt(radiusMeters) }),
        ...extras,
        ...audienceColumns(audience)
      },
      include: {
        creator: { select: { id: true, name: true, position: true, role: true } },
        category: { select: { id: true, code: true, name: true, color: true } },
        _count: { select: { attendance: true, occurrences: true } }
      }
    })

    // A rule change re-writes the series (plan §8.2); instances that already hold
    // attendance or registrations are kept and reported instead of deleted.
    if (body.rrule !== undefined) {
      if (eventRow.seriesId) throw badRequest('This is one instance of a recurring series — edit the series itself')

      const template: SeriesTemplate = {
        title: eventRow.title,
        lat: eventRow.lat,
        lng: eventRow.lng,
        radiusMeters: eventRow.radiusMeters,
        categoryId: eventRow.categoryId,
        capacity: eventRow.capacity,
        registrationRequired: eventRow.registrationRequired,
        createdBy: eventRow.createdBy,
        audienceType: audience.type,
        audienceCollegeId: audience.collegeId,
        audienceYearLevel: audience.yearLevel,
        audienceSectionId: audience.sectionId
      }

      const rruleText = typeof body.rrule === 'string' ? body.rrule.trim() : ''
      if (!rruleText) {
        const sync = await syncOccurrences(prisma, id, [eventRow.date], template)
        const cleared = await prisma.event.update({
          where: { id },
          data: { rrule: null, recurrenceIndex: 0 },
          include: { category: { select: { id: true, code: true, name: true, color: true } } }
        })
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'event_series_updated',
            details: JSON.stringify({ eventId: id, cleared: true, ...sync }),
            performedBy: user.id
          }
        })
        return { ...cleared, occurrenceCount: 1, seriesChange: sync }
      }

      const { dates, rrule } = planOccurrences(rruleText, eventRow.date)
      const sync = await syncOccurrences(prisma, id, dates, template)
      const master = await prisma.event.update({
        where: { id },
        data: { rrule, recurrenceIndex: 0 },
        include: { category: { select: { id: true, code: true, name: true, color: true } } }
      })
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'event_series_updated',
          details: JSON.stringify({ eventId: id, rrule, occurrences: dates.length, ...sync }),
          performedBy: user.id
        }
      })
      return { ...master, occurrenceCount: dates.length, seriesChange: sync }
    }

    return eventRow
  }

  if (getMethod(event) === 'DELETE') {
    requireStaff(user)

    // A series master takes its occurrences with it (cascade); count them first
    // so the audit says how much went, and refuse rather than trip the
    // attendance foreign key when there is history to lose.
    const attendance = await prisma.attendance.count({ where: { OR: [{ eventId: id }, { event: { seriesId: id } }] } })
    if (attendance > 0) {
      throw new HttpError(409, 'This event has recorded attendance — it cannot be deleted')
    }

    const occurrences = await prisma.event.count({ where: { seriesId: id } })
    await prisma.event.delete({ where: { id } })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'event_deleted',
        details: JSON.stringify({ eventId: id, occurrences }),
        performedBy: user.id
      }
    })
    return noContent(event, 204)
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
