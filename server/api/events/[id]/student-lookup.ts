import { getMethod, getQuery, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { badRequest, defineApiHandler, notFound, respond } from '../../../utils/http'
import { requireEventScope } from '../../../utils/delegation'

/**
 * GET /api/events/:id/student-lookup?q= — who is being scanned (plan §8.2).
 *
 * The scanner needs to turn a student number (1D barcode off an ID) or a typed
 * name into a person, and the person holding the scanner is often a temporary
 * delegate, not staff. So this is scoped to the event's `manual_checkin` grant
 * and returns the minimum the door needs — never the full student list.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const eventId = getRouterParam(event, 'id') ?? ''
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()

  await requireEventScope(prisma, user, eventId, 'manual_checkin')

  const eventRow = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!eventRow) throw notFound('Event not found')

  if (q.length < 2) throw badRequest('Type at least two characters of a student number or a name')
  if (q.length > 60) throw badRequest('That search is too long')

  const rows = await prisma.user.findMany({
    where: {
      active: true,
      studentProfile: { isNot: null },
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { studentProfile: { is: { studentNo: { contains: q, mode: 'insensitive' } } } }
      ]
    },
    select: {
      id: true,
      name: true,
      studentProfile: { select: { studentNo: true, yearLevel: true, section: { select: { name: true, yearLevel: true } } } }
    },
    orderBy: { name: 'asc' },
    take: 8
  })

  const students = rows.map(row => ({
    id: row.id,
    name: row.name,
    studentNo: row.studentProfile?.studentNo ?? null,
    yearLevel: row.studentProfile?.yearLevel ?? row.studentProfile?.section?.yearLevel ?? null,
    section: row.studentProfile?.section?.name ?? null
  }))

  // The barcode path fires a check-in straight away when the number is exact;
  // anything less definite is offered to the officer as a choice.
  const wanted = q.toUpperCase()
  const exact = students.find(s => (s.studentNo ?? '').toUpperCase() === wanted) ?? null

  return { query: q, exact: exact?.id ?? null, students }
})
