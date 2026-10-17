import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET /api/cms/officers
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const query = getQuery(event)
  const academicYear = query.academicYear as string | undefined

  let whereClause = {}
  if (academicYear) {
    whereClause = { academicYear }
  } else {
    const settings = await prisma.settings.findFirst()
    if (settings?.currentAcademicYear) {
      whereClause = { academicYear: settings.currentAcademicYear }
    }
  }

  const officersList = await prisma.officer.findMany({
    where: whereClause,
    orderBy: { name: 'asc' }
  })

  return officersList
})
