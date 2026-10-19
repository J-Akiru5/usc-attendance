import { getMethod } from 'h3'
import { prisma } from '../utils/prisma'
import { defineApiHandler, respond } from '../utils/http'
import { formatPeso } from '../utils/fines'
import { statusCounts } from '../utils/finance'
import { lineViews, resolveBudget, totalsFor } from '../utils/finance-data'

/**
 * GET /api/transparency — the public, summary-only transparency board (plan
 * §8.7). No authentication: a visitor sees the totals of the current semester's
 * budget lines and nothing else — no names, no student data, no individual
 * entries or proposals.
 *
 * It answers `{ enabled: false }` until the council flips the switch in
 * /manage/finance, which is what "behind an explicit toggle" means.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const settings = await prisma.financeSettings.findFirst()
  if (!settings?.transparencyPublic) return { enabled: false }

  const now = new Date()
  const semester = await prisma.semester.findFirst({
    where: { startsOn: { lte: now }, endsOn: { gt: now } },
    orderBy: { startsOn: 'desc' }
  })
  const budget = await resolveBudget(prisma, semester?.id ?? null)
  if (!budget) {
    return {
      enabled: true,
      note: settings.transparencyNote,
      updatedAt: settings.updatedAt,
      semester: semester ? { name: semester.name, startsOn: semester.startsOn, endsOn: semester.endsOn } : null,
      lines: [],
      totals: null,
      proposals: { total: 0, byStatus: {} }
    }
  }

  const totals = totalsFor(budget)
  const proposals = await prisma.budgetProposal.findMany({
    where: { budgetId: budget.id },
    select: { status: true }
  })

  return {
    enabled: true,
    note: settings.transparencyNote,
    updatedAt: settings.updatedAt,
    semester: budget.semester,
    // Summary only: the same per-line totals the council sees, with no personal
    // names, receipts or proposal details attached.
    lines: lineViews(budget).map(line => ({
      name: line.name,
      category: line.category,
      allocatedCentavos: line.allocatedCentavos,
      allocatedPesos: formatPeso(line.allocatedCentavos),
      expenseCentavos: line.expenseCentavos,
      expensePesos: formatPeso(line.expenseCentavos),
      incomeCentavos: line.incomeCentavos,
      incomePesos: formatPeso(line.incomeCentavos),
      remainingCentavos: line.remainingCentavos,
      remainingPesos: formatPeso(line.remainingCentavos)
    })),
    totals: {
      allocatedCentavos: totals.allocatedCentavos,
      allocatedPesos: formatPeso(totals.allocatedCentavos),
      expenseCentavos: totals.expenseCentavos,
      expensePesos: formatPeso(totals.expenseCentavos),
      incomeCentavos: totals.incomeCentavos,
      incomePesos: formatPeso(totals.incomeCentavos),
      remainingCentavos: totals.remainingCentavos,
      remainingPesos: formatPeso(totals.remainingCentavos)
    },
    proposals: { total: proposals.length, byStatus: statusCounts(proposals.map(p => p.status)) }
  }
})
