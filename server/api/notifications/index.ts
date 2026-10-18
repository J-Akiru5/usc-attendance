import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, respond } from '../../utils/http'

/**
 * GET /api/notifications?limit=&offset=&unreadOnly= — the caller's own inbox
 * (plan §8.4). Only rows delivered in-app appear; a notification that went out
 * by email alone is still recorded (so the reminder cron can tell what it
 * already sent) but is not shown as if it were in the inbox.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const query = getQuery(event)

  const limitRaw = Number(query.limit ?? 30)
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) throw badRequest('limit must be a whole number between 1 and 100')
  const offsetRaw = Number(query.offset ?? 0)
  if (!Number.isInteger(offsetRaw) || offsetRaw < 0) throw badRequest('offset must be a whole number of at least 0')

  const where = {
    userId: user.id,
    channels: { has: 'inApp' },
    ...(query.unreadOnly === 'true' && { readAt: null })
  }

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limitRaw,
      skip: offsetRaw,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
        creator: { select: { id: true, name: true } }
      }
    }),
    prisma.notification.count({ where: { userId: user.id, channels: { has: 'inApp' }, readAt: null } })
  ])

  return { unread, notifications }
})
