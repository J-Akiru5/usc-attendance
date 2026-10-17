import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET /api/delegations/mine  — my own active grants (any signed-in officer)
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)

  const grants = await prisma.eventDelegate.findMany({
    where: { userId: actor.id, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { event: { select: { id: true, title: true, date: true } } },
    orderBy: { expiresAt: 'asc' }
  })
  return grants
})
