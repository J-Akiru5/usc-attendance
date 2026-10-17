import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET /api/cms/projects
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

  const projectsList = await prisma.project.findMany({
    where: whereClause,
    orderBy: { title: 'asc' }
  })

  return projectsList
})
