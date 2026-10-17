import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { requireCanDelegate } from '../../utils/delegation'

const PERSON = { id: true, name: true, position: true } as const

// ---------------------------------------------------------------------------
// GET /api/delegations/candidates — active officers who can be given access
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireCanDelegate(actor)

  const officers = await prisma.user.findMany({
    where: { active: true, id: { not: actor.id }, role: { not: 'student' } },
    select: PERSON,
    orderBy: { name: 'asc' }
  })
  return officers
})
