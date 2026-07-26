import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET: public — list photos for an event with cursor pagination
  if (req.method === 'GET') {
    const eventSlug = req.query.eventSlug as string
    if (!eventSlug) {
      return res.status(400).json({ error: 'Missing required query param: eventSlug' })
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 24, 1), 100)
    const cursor = req.query.cursor as string | undefined

    const photos = await prisma.photo.findMany({
      where: { eventSlug },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = photos.length > limit
    const data = hasMore ? photos.slice(0, limit) : photos
    const nextCursor = hasMore ? data[data.length - 1].id : null

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return res.status(200).json({ data, nextCursor })
  }

  try {
    const user = await authenticate(req)

    if (req.method === 'POST') {
      requireStaff(user)

      const { eventSlug, storageKeyFull, storageKeyThumb } = req.body
      if (!eventSlug || !storageKeyFull || !storageKeyThumb) {
        return res.status(400).json({ error: 'Missing required fields: eventSlug, storageKeyFull, storageKeyThumb' })
      }

      const photo = await prisma.photo.create({
        data: {
          eventSlug,
          storageKeyFull,
          storageKeyThumb,
          uploadedBy: user.id,
        },
      })

      return res.status(201).json(photo)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
