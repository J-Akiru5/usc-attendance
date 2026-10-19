import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../utils/http'
import { auditContext, auditWrite } from '../../utils/audit'

/**
 * POST /api/clearance/revoke — pull a certificate back (plan §8.5): issued in
 * error, or a record the council has decided should not stand. The certificate
 * itself stays readable; /verify then says it was revoked rather than valid.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const body = await readJsonBody(event) ?? {}
  const clearanceId = typeof body.clearanceId === 'string' ? body.clearanceId : ''
  if (!clearanceId) throw badRequest('clearanceId is required')

  const clearance = await prisma.clearance.findUnique({ where: { id: clearanceId } })
  if (!clearance) throw new HttpError(404, 'Clearance not found')
  if (clearance.revokedAt) throw new HttpError(409, 'That clearance is already revoked')

  const revoked = await prisma.clearance.update({
    where: { id: clearanceId },
    data: {
      revokedAt: new Date(),
      revokedBy: user.id,
      ...(typeof body.note === 'string' && body.note.trim().length > 0 && { note: body.note.trim().slice(0, 300) })
    }
  })

  await auditWrite(prisma, {
    actor: user,
    action: 'clearance_revoked',
    targetType: 'clearance',
    targetId: clearanceId,
    userId: clearance.userId,
    details: { note: revoked.note },
    ...auditContext(event)
  })

  return { clearance: { id: revoked.id, revokedAt: revoked.revokedAt } }
})
