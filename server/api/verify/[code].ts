import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'
import { clearanceState, normaliseCode, publicVerification } from '../../utils/payments'

/**
 * GET /api/verify/:code — the PUBLIC check behind /verify/<code> (plan §8.5,
 * D-07). No session required: a certificate is meant to be checkable by anyone
 * the student shows it to.
 *
 * It answers three things — does it stand, when was it issued, and who issued it
 * — and deliberately **not** who it belongs to or what it covered. It recomputes
 * the live standing, so an old certificate for someone who now owes money reads
 * "no longer cleared" instead of lying.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const raw = getRouterParam(event, 'code') ?? ''
  const code = normaliseCode(raw)

  if (code.length < 6 || code.length > 24) {
    return publicVerification({ clearance: null, currentlyCleared: false })
  }

  const clearance = await prisma.clearance.findUnique({
    where: { code },
    select: {
      userId: true,
      issuedAt: true,
      coveredCentavos: true,
      revokedAt: true,
      issuer: { select: { name: true } }
    }
  })

  if (!clearance) {
    return publicVerification({ clearance: null, currentlyCleared: false })
  }

  const fines = await prisma.fine.findMany({
    where: { userId: clearance.userId },
    select: { amountCentavos: true, status: true }
  })

  return publicVerification({
    clearance: {
      code,
      issuedAt: clearance.issuedAt,
      coveredCentavos: clearance.coveredCentavos,
      revokedAt: clearance.revokedAt
    },
    issuer: clearance.issuer,
    currentlyCleared: clearanceState(fines).cleared
  })
})
