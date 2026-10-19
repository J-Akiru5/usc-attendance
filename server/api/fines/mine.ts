import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { clearanceState } from '../../utils/fines'

/**
 * GET /api/fines/mine — a student's own fines and what they add up to
 * (plan §8.5). Settled and waived ones stay visible: a receipt is a receipt.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)

  const fines = await prisma.fine.findMany({
    where: { userId: user.id },
    orderBy: [{ issuedAt: 'desc' }],
    include: { event: { select: { id: true, title: true, date: true } } }
  })

  // D-01: "cleared" means nothing outstanding — an unserved service sanction
  // stands exactly like unpaid money, and a warning never does.
  const state = clearanceState(fines)
  return {
    fines,
    summary: {
      count: fines.length,
      unpaid: state.outstanding,
      unpaidCentavos: state.unpaidCentavos,
      unpaidPesos: state.unpaidPesos,
      outstanding: state.outstanding,
      cleared: state.cleared
    }
  }
})
