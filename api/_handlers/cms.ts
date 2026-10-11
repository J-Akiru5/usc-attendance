import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { handle } from '../_lib/http.js'

// ---------------------------------------------------------------------------
// GET /api/cms/content
// ---------------------------------------------------------------------------
export const content = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const page = req.query.page as string
  if (!page) {
    return res.status(400).json({ error: 'Missing required query param: page' })
  }

  const siteContent = await prisma.siteContent.findUnique({
    where: { key: page },
  })

  if (!siteContent) {
    return res.status(404).json({ error: `No content found for page: ${page}` })
  }

  return res.status(200).json(siteContent.content)
})

// ---------------------------------------------------------------------------
// GET /api/cms/events
// ---------------------------------------------------------------------------
export const events = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const cmsEvents = await prisma.publicEvent.findMany({
    orderBy: { date: 'desc' },
  })

  return res.status(200).json(cmsEvents)
})

// ---------------------------------------------------------------------------
// GET /api/cms/officers
// ---------------------------------------------------------------------------
export const officers = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const academicYear = req.query.academicYear as string | undefined

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
    orderBy: { name: 'asc' },
  })

  return res.status(200).json(officersList)
})

// ---------------------------------------------------------------------------
// GET /api/cms/projects
// ---------------------------------------------------------------------------
export const projects = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const academicYear = req.query.academicYear as string | undefined

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
    orderBy: { title: 'asc' },
  })

  return res.status(200).json(projectsList)
})
