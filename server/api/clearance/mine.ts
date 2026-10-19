import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { clearanceState } from '../../utils/payments'

/**
 * GET /api/clearance/mine — a student's standing and their latest certificate
 * (plan §8.5). The certificate is a record of a moment; whether they are *still*
 * clear is recomputed here, not read from the certificate.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)

  const [fines, clearance] = await Promise.all([
    prisma.fine.findMany({ where: { userId: user.id }, select: { id: true, amountCentavos: true, status: true, eventId: true, kind: true } }),
    prisma.clearance.findFirst({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
      include: { issuer: { select: { id: true, name: true } } }
    })
  ])

  return {
    state: clearanceState(fines),
    clearance: clearance
      ? {
          id: clearance.id,
          code: clearance.code,
          issuedAt: clearance.issuedAt,
          coveredCentavos: clearance.coveredCentavos,
          revokedAt: clearance.revokedAt,
          issuer: clearance.issuer
        }
      : null
  }
})
