import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { formatPeso, totalCentavos } from '../../utils/fines'

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

  const unpaid = totalCentavos(fines)
  return {
    fines,
    summary: {
      count: fines.length,
      unpaid: fines.filter(f => f.status === 'unpaid').length,
      unpaidCentavos: unpaid,
      unpaidPesos: formatPeso(unpaid),
      cleared: unpaid === 0
    }
  }
})
