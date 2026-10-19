import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, HttpError, isUniqueViolation, readJsonBody, respond } from '../../utils/http'
import { formatPeso } from '../../utils/fines'
import { optionalText, requireFinanceManager, requireFinanceReader, requireText } from '../../utils/finance'
import { lineViews, resolveBudget, totalsFor, type BudgetWithLines } from '../../utils/finance-data'
import { auditContext, auditWrite } from '../../utils/audit'

/**
 * /api/finance/budget — the semester budget (plan §8.7).
 *   GET  ?semesterId=  the budget, its line totals and its most recent entries
 *   POST               open a budget for a semester
 *
 * Reading is open to the Treasurer, the noters and the Auditor; opening a budget
 * is the Treasurer's job.
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)

  if (getMethod(event) === 'GET') {
    requireFinanceReader(user)
    const query = getQuery(event)
    const semesterId = typeof query.semesterId === 'string' ? query.semesterId : ''
    const includeEntries = query.entries !== 'none'

    const semesters = await prisma.semester.findMany({
      orderBy: { startsOn: 'desc' },
      select: { id: true, name: true, startsOn: true, endsOn: true }
    })
    const budget = await resolveBudget(prisma, semesterId || null)
    if (!budget) return { budget: null, lines: [], totals: null, entries: [], semesters }

    const totals = totalsFor(budget)
    const entries = includeEntries
      ? await prisma.budgetEntry.findMany({
          where: { line: { budgetId: budget.id } },
          orderBy: { spentAt: 'desc' },
          take: 200,
          include: {
            line: { select: { id: true, name: true } },
            recorder: { select: { id: true, name: true } },
            proposal: { select: { id: true, title: true } }
          }
        })
      : []

    // Income that has been collected (plan §8.7) — informational. Fine payments
    // recorded by the Treasurer (P4d) will feed an income entry when that lands;
    // here the figure comes straight from the settled fines in this semester.
    const finesIncome = await prisma.fine.aggregate({
      _sum: { amountCentavos: true },
      where: { status: 'paid', paidAt: { gte: budget.semester.startsOn, lt: budget.semester.endsOn } }
    })

    return {
      budget: budgetSummary(budget),
      lines: lineViews(budget),
      totals: { ...totals, remainingPesos: formatPeso(totals.remainingCentavos) },
      entries,
      finesIncomeCentavos: finesIncome._sum.amountCentavos ?? 0,
      semesters
    }
  }

  if (getMethod(event) === 'POST') {
    requireFinanceManager(user)
    const body = await readJsonBody(event) ?? {}
    const semesterId = requireText(body.semesterId, 'The semester', 1, 60)
    const notes = optionalText(body.notes, 'The notes', 1000)

    const semester = await prisma.semester.findUnique({ where: { id: semesterId } })
    if (!semester) throw new HttpError(404, 'Unknown semester')

    const existing = await prisma.budget.findUnique({ where: { semesterId } })
    if (existing) throw new HttpError(409, 'That semester already has a budget')

    try {
      const budget = await prisma.budget.create({
        data: { semesterId, notes, createdBy: user.id },
        include: { semester: { select: { id: true, name: true, startsOn: true, endsOn: true } } }
      })
      await auditWrite(prisma, {
        actor: user,
        action: 'finance_budget_opened',
        targetType: 'budget',
        targetId: budget.id,
        details: { semesterId, semester: semester.name },
        ...auditContext(event)
      })
      return respond(event, 201, { budget })
    } catch (error) {
      if (isUniqueViolation(error)) throw new HttpError(409, 'That semester already has a budget')
      throw error
    }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})

function budgetSummary(budget: BudgetWithLines) {
  return {
    id: budget.id,
    status: budget.status,
    notes: budget.notes,
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
    semester: budget.semester,
    creator: budget.creator
  }
}
