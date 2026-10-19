import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, respond } from '../../utils/http'
import { rankStudents } from '../../utils/analytics'
import { attendanceRows, eventsInWindow, resolveSemester } from '../../utils/analytics-data'

/**
 * GET /api/analytics/students?semesterId=&order=top|bottom&limit= — who turns up
 * and who never does (plan §8.3's "top/bottom attendance").
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const query = getQuery(event)
  const order = query.order === 'bottom' ? 'bottom' : 'top'
  const limitRaw = Number(query.limit ?? 10)
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) {
    throw badRequest('limit must be a whole number between 1 and 100')
  }

  const window = await resolveSemester(prisma, typeof query.semesterId === 'string' ? query.semesterId : undefined)
  const events = await eventsInWindow(prisma, window)
  const rows = await attendanceRows(prisma, events.map(row => row.id))

  // Every active student starts at zero, so `order=bottom` is the no-show list
  // rather than just the least frequent attenders (plan §8.3).
  const audience = await prisma.user.findMany({
    // Same rule as the audience resolver: the profile defines a student.
    where: { active: true, studentProfile: { isNot: null } },
    select: { id: true }
  })
  const counts = new Map<string, number>(audience.map(row => [row.id, 0]))
  for (const row of rows) counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
  const ranked = rankStudents(counts, order, limitRaw)

  const students = ranked.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: ranked.map(row => row.userId) } },
        select: {
          id: true,
          name: true,
          studentProfile: { select: { studentNo: true, yearLevel: true, section: { select: { name: true } } } }
        }
      })
    : []
  const byId = new Map(students.map(row => [row.id, row]))

  return {
    order,
    events: events.length,
    students: ranked.map((row) => {
      const profile = byId.get(row.userId)
      return {
        id: row.userId,
        name: profile?.name ?? 'Unknown',
        studentNo: profile?.studentProfile?.studentNo ?? null,
        yearLevel: profile?.studentProfile?.yearLevel ?? null,
        section: profile?.studentProfile?.section?.name ?? null,
        attended: row.count
      }
    })
  }
})
