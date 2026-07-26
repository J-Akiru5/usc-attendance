import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../../_lib/prisma.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
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

    const projects = await prisma.project.findMany({
      where: whereClause,
      orderBy: { title: 'asc' },
    })

    return res.status(200).json(projects)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return res.status(500).json({ error: message })
  }
}
