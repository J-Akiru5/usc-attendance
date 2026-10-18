import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET /api/reference/academic — public reference tree (active rows only):
// colleges → programs → sections. Used by the registration form and the admin
// UI; small enough to return whole.
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const colleges = await prisma.college.findMany({
    where: { archived: false },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      programs: {
        where: { archived: false },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          yearLevels: true,
          sections: {
            where: { archived: false },
            orderBy: [{ yearLevel: 'asc' }, { name: 'asc' }],
            select: { id: true, yearLevel: true, name: true }
          }
        }
      }
    }
  })

  return { colleges }
})
