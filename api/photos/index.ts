import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET: public — list photos for an event
  if (req.method === 'GET') {
    const eventSlug = req.query.eventSlug as string
    if (!eventSlug) {
      return res.status(400).json({ error: 'Missing required query param: eventSlug' })
    }

    const photos = await prisma.photo.findMany({
      where: { eventSlug },
      orderBy: { createdAt: 'asc' },
    })

    return res.status(200).json(photos)
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
