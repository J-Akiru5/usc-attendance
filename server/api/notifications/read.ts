import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, readJsonBody, respond } from '../../utils/http'

/**
 * POST /api/notifications/read  { ids?: string[], all?: boolean }
 * Marks the caller's own notifications as read — never anyone else's.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const body = await readJsonBody(event) ?? {}
  const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string') : []

  if (body.all !== true && ids.length === 0) {
    throw badRequest('Send ids, or all: true')
  }

  const { count } = await prisma.notification.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      ...(body.all === true ? {} : { id: { in: ids } })
    },
    data: { readAt: new Date() }
  })

  return { updated: count }
})
