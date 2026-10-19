import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'
import { clearanceState, normaliseCode, publicVerification } from '../../utils/payments'

/**
 * GET /api/verify/:code — the PUBLIC check behind /verify/<code> (plan §8.5).
 * No session required: a certificate is meant to be checkable by anyone the
 * student shows it to. It returns the minimum that makes it useful — the name,
 * the student number, when it was issued and what it covered — and it recomputes
 * the live standing, so an old certificate for someone who now owes money reads
 * "no longer cleared" instead of lying.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const raw = getRouterParam(event, 'code') ?? ''
  const code = normaliseCode(raw)

  if (code.length < 6 || code.length > 24) {
    return publicVerification({ clearance: null, student: null, currentlyCleared: false })
  }

  const clearance = await prisma.clearance.findUnique({
    where: { code },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          studentProfile: { select: { studentNo: true } }
        }
      }
    }
  })

  if (!clearance) {
    return publicVerification({ clearance: null, student: null, currentlyCleared: false })
  }

  const fines = await prisma.fine.findMany({
    where: { userId: clearance.userId },
    select: { amountCentavos: true, status: true }
  })

  return publicVerification({
    clearance: {
      code: clearance.code,
      issuedAt: clearance.issuedAt,
      coveredCentavos: clearance.coveredCentavos,
      revokedAt: clearance.revokedAt
    },
    student: {
      name: clearance.student.name,
      studentNo: clearance.student.studentProfile?.studentNo ?? null
    },
    currentlyCleared: clearanceState(fines).cleared
  })
})
