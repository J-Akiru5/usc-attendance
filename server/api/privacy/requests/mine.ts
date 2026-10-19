import { getMethod } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, respond } from '../../../utils/http'

/**
 * GET /api/privacy/requests/mine — the caller's own rectification history.
 * A student should be able to see what they asked for and what was decided,
 * without asking an officer to read the queue back to them.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)

  const requests = await prisma.privacyRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      kind: true,
      field: true,
      currentValue: true,
      proposedValue: true,
      note: true,
      status: true,
      reason: true,
      createdAt: true,
      decidedAt: true,
      decider: { select: { name: true } }
    }
  })

  return { requests }
})
