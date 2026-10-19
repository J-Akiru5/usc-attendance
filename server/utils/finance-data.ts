import type { Prisma, PrismaClient } from '@prisma/client'
import { budgetTotals, lineTotals, type BudgetTotals, type LineTotals } from './finance'

/**
 * The rows the finance routes share (plan §8.7). Kept apart from `finance.ts`
 * (pure logic) so the routes stay thin and every total is computed by a tested
 * function.
 */

export interface BudgetWithLines {
  id: string
  semesterId: string
  status: string
  notes: string | null
  createdAt: Date
  updatedAt: Date
  semester: { id: string, name: string, startsOn: Date, endsOn: Date }
  creator: { id: string, name: string }
  lines: Array<{
    id: string
    name: string
    category: string
    allocatedCentavos: number
    notes: string | null
    sortOrder: number
    archived: boolean
    entries: Array<{ id: string, kind: string, amountCentavos: number, spentAt: Date, receiptKey: string | null }>
  }>
}

const budgetInclude: Prisma.BudgetInclude = {
  semester: { select: { id: true, name: true, startsOn: true, endsOn: true } },
  creator: { select: { id: true, name: true } },
  lines: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      entries: {
        orderBy: { spentAt: 'asc' },
        select: { id: true, kind: true, amountCentavos: true, spentAt: true, receiptKey: true }
      }
    }
  }
}

/** The budget for one semester, or the most recent one when none is asked for. */
export async function resolveBudget(db: PrismaClient, semesterId?: string | null): Promise<BudgetWithLines | null> {
  if (semesterId) {
    return db.budget.findUnique({ where: { semesterId }, include: budgetInclude }) as Promise<BudgetWithLines | null>
  }
  return db.budget.findFirst({ orderBy: { createdAt: 'desc' }, include: budgetInclude }) as Promise<BudgetWithLines | null>
}

/** The finance-wide settings row (the transparency switch), created on first use. */
export async function getFinanceSettings(db: PrismaClient) {
  return (await db.financeSettings.findFirst()) ?? (await db.financeSettings.create({ data: {} }))
}

/** Per-line totals for a budget, keyed by line id. */
export function lineTotalsMap(budget: BudgetWithLines): Map<string, LineTotals> {
  const map = new Map<string, LineTotals>()
  for (const line of budget.lines) {
    map.set(line.id, lineTotals(line.allocatedCentavos, line.entries))
  }
  return map
}

/** The budget's own totals, from the same per-line maths the UI shows. */
export function totalsFor(budget: BudgetWithLines): BudgetTotals {
  return budgetTotals(budget.lines.map(line => ({ allocatedCentavos: line.allocatedCentavos, entries: line.entries })))
}

export interface LineView {
  id: string
  name: string
  category: string
  allocatedCentavos: number
  notes: string | null
  sortOrder: number
  archived: boolean
  incomeCentavos: number
  expenseCentavos: number
  remainingCentavos: number
  entries: number
}

/** The line rows a route returns: allocation, what moved, what is left. */
export function lineViews(budget: BudgetWithLines): LineView[] {
  const totals = lineTotalsMap(budget)
  return budget.lines.map((line) => {
    const row = totals.get(line.id) ?? lineTotals(line.allocatedCentavos, [])
    return {
      id: line.id,
      name: line.name,
      category: line.category,
      allocatedCentavos: line.allocatedCentavos,
      notes: line.notes,
      sortOrder: line.sortOrder,
      archived: line.archived,
      incomeCentavos: row.incomeCentavos,
      expenseCentavos: row.expenseCentavos,
      remainingCentavos: row.remainingCentavos,
      entries: line.entries.length
    }
  })
}
