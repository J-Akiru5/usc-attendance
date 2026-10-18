import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, HttpError, respond } from '../../../utils/http'
import { hasEventScope } from '../../../utils/delegation'
import { describeAudience, resolveAudience, specFromEvent } from '../../../utils/audience'

/**
 * GET /api/events/:id/audience — who is required to attend (plan §8.2).
 * Staff, or an officer holding `view_roster` for this event. This is the same
 * resolver that analytics counts as "expected" and that P4's absence fines will
 * generate from, so the door, the dashboard and the fines cannot disagree.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const eventId = getRouterParam(event, 'id') ?? ''

  const { allowed } = await hasEventScope(prisma, user, eventId, 'view_roster')
  if (!allowed) throw new HttpError(403, 'Access denied. Roster access required.')

  const row = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      audienceType: true,
      audienceCollegeId: true,
      audienceYearLevel: true,
      audienceSectionId: true,
      audienceCollege: { select: { id: true, code: true, name: true } },
      audienceSection: { select: { id: true, name: true } }
    }
  })
  if (!row) throw new HttpError(404, 'Event not found')

  const spec = specFromEvent(row)
  const ids = await resolveAudience(prisma, spec)

  const students = ids.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        orderBy: { name: 'asc' },
        take: 500,
        select: {
          id: true,
          name: true,
          studentProfile: { select: { studentNo: true, yearLevel: true, section: { select: { name: true } } } }
        }
      })
    : []

  return {
    eventId: row.id,
    spec,
    description: describeAudience(spec, {
      college: row.audienceCollege ? (row.audienceCollege.code || row.audienceCollege.name) : null,
      section: row.audienceSection?.name ?? null
    }),
    count: ids.length,
    students: students.map(student => ({
      id: student.id,
      name: student.name,
      studentNo: student.studentProfile?.studentNo ?? null,
      yearLevel: student.studentProfile?.yearLevel ?? null,
      section: student.studentProfile?.section?.name ?? null
    }))
  }
})
