import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../../_lib/prisma.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const page = req.query.page as string
    if (!page) {
      return res.status(400).json({ error: 'Missing required query param: page' })
    }

    const content = await prisma.siteContent.findUnique({
      where: { key: page },
    })

    if (!content) {
      return res.status(404).json({ error: `No content found for page: ${page}` })
    }

    return res.status(200).json(content.content)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return res.status(500).json({ error: message })
  }
}
