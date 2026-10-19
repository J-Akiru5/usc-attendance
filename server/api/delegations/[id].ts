import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, notFound, respond } from '../../utils/http'
import { requireCanDelegate } from '../../utils/delegation'
import { auditContext, auditWrite } from '../../utils/audit'

// ---------------------------------------------------------------------------
// DELETE /api/delegations/:id  — revoke immediately (President/Secretary only)
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'DELETE') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireCanDelegate(actor)

  const id = getRouterParam(event, 'id') ?? ''

  const grant = await prisma.eventDelegate.findUnique({ where: { id } })
  if (!grant) throw notFound('Grant not found')

  // Idempotent: revoking an already-revoked grant just returns it.
  if (grant.revokedAt) return grant

  const now = new Date()
  const revoked = await prisma.$transaction(async (tx) => {
    const updated = await tx.eventDelegate.update({
      where: { id },
      data: { revokedAt: now, revokedBy: actor.id }
    })
    await auditWrite(tx, {
      actor,
      action: 'delegation_revoked',
      targetType: 'delegation_grant',
      targetId: id,
      userId: grant.userId,
      details: { eventId: grant.eventId },
      ...auditContext(event)
    })
    return updated
  })
  return revoked
})
