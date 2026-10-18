import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'

/**
 * GET /api/reference/semesters — the academic terms, newest first, for pickers
 * (analytics, reports). Reference data lives here rather than as a GET on the
 * legacy POST-only `/api/semesters`, whose contract stays as it was.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  return prisma.semester.findMany({
    orderBy: { startsOn: 'desc' },
    select: { id: true, name: true, startsOn: true, endsOn: true }
  })
})
