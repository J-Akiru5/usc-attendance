import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, notFound, readJsonBody, respond } from '../../utils/http'
import { createOccurrences, planOccurrences } from '../../utils/event-series'

/** Shared shape for the event form and the calendar (plan §8.2). */
const eventInclude = {
  creator: { select: { id: true, name: true, position: true, role: true } },
  category: { select: { id: true, code: true, name: true, color: true } },
  _count: { select: { attendance: true } }
} as const

/** Validates the optional calendar/registration fields the form may send. */
async function parseEventExtras(body: Record<string, unknown>): Promise<{
  categoryId: string | null
  capacity: number | null
  registrationRequired: boolean
}> {
  let categoryId: string | null = null
  if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== '') {
    if (typeof body.categoryId !== 'string') throw badRequest('categoryId must be text')
    const category = await prisma.eventCategory.findUnique({ where: { id: body.categoryId } })
    if (!category) throw notFound('Event category not found')
    if (category.archived) throw badRequest('That event category is archived')
    categoryId = category.id
  }

  let capacity: number | null = null
  if (body.capacity !== undefined && body.capacity !== null && body.capacity !== '') {
    const value = Number(body.capacity)
    if (!Number.isInteger(value) || value < 1 || value > 100000) {
      throw badRequest('Capacity must be a whole number of at least 1 (or empty for unlimited)')
    }
    capacity = value
  }

  return { categoryId, capacity, registrationRequired: body.registrationRequired === true }
}

// ---------------------------------------------------------------------------
// GET /api/events            ?categoryId=&from=&to=   (any signed-in officer)
// POST /api/events           staff
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)

  if (getMethod(event) === 'GET') {
    const query = getQuery(event)
    const categoryId = typeof query.categoryId === 'string' ? query.categoryId.trim() : ''
    const from = typeof query.from === 'string' ? new Date(query.from) : null
    const to = typeof query.to === 'string' ? new Date(query.to) : null

    const eventsList = await prisma.event.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())
          ? { date: { gte: from, lte: to } }
          : {})
      },
      orderBy: { date: 'desc' },
      include: eventInclude
    })
    return eventsList
  }

  if (getMethod(event) === 'POST') {
    requireStaff(user)

    const body = await readJsonBody(event) ?? {}
    const { title, date, lat, lng, radiusMeters } = body

    if (!title || !date || lat === undefined || lng === undefined) {
      throw badRequest('Missing required fields: title, date, lat, lng')
    }

    const extras = await parseEventExtras(body)

    const start = new Date(String(date))
    const rruleText = typeof body.rrule === 'string' ? body.rrule.trim() : ''
    const series = rruleText ? planOccurrences(rruleText, start) : null

    const latValue = parseFloat(String(lat))
    const lngValue = parseFloat(String(lng))
    const radiusValue = radiusMeters ? parseInt(String(radiusMeters)) : 50

    const eventRow = await prisma.event.create({
      data: {
        title: String(title),
        date: start,
        lat: latValue,
        lng: lngValue,
        radiusMeters: radiusValue,
        createdBy: user.id,
        ...extras,
        ...(series && { rrule: series.rrule, recurrenceIndex: 0 })
      },
      include: eventInclude
    })

    // A recurring series is materialised: one real event per later occurrence
    // (plan §8.2's acceptance — the calendar simply lists them).
    let occurrenceCount = 1
    if (series) {
      const created = await createOccurrences(prisma, eventRow.id, series.dates, {
        title: eventRow.title,
        lat: latValue,
        lng: lngValue,
        radiusMeters: radiusValue,
        categoryId: extras.categoryId,
        capacity: extras.capacity,
        registrationRequired: extras.registrationRequired,
        createdBy: user.id
      })
      occurrenceCount = created + 1
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'event_series_created',
          details: JSON.stringify({ eventId: eventRow.id, rrule: series.rrule, occurrences: occurrenceCount }),
          performedBy: user.id
        }
      })
    }

    return respond(event, 201, { ...eventRow, occurrenceCount })
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
