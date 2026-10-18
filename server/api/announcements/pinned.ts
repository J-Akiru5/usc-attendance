import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { renderAnnouncementBody } from '../../utils/announce'

/**
 * GET /api/announcements/pinned — what the council has pinned, for everyone
 * signed in (the dashboard card). Only sent, pinned ones: a draft is nobody's
 * business yet.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  await authenticate(event)

  const items = await prisma.announcement.findMany({
    where: { pinned: true, status: 'sent' },
    orderBy: { sentAt: 'desc' },
    take: 3,
    include: { creator: { select: { id: true, name: true } } }
  })

  return {
    items: items.map(item => ({
      id: item.id,
      title: item.title,
      preview: renderAnnouncementBody(item.body),
      sentAt: item.sentAt,
      creator: item.creator
    }))
  }
})
