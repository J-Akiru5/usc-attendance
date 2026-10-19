import { getMethod } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, HttpError, isUniqueViolation, readJsonBody, respond } from '../../../utils/http'
import {
  LINE_CATEGORIES,
  optionalText,
  parseCentavos,
  parseEnum,
  requireFinanceManager,
  requireFinanceReader,
  requireText
} from '../../../utils/finance'
import { lineViews, resolveBudget } from '../../../utils/finance-data'

/**
 * /api/finance/lines — the line items of a budget (plan §8.7).
 *   GET  ?budgetId=    every line with its totals
 *   POST               add a line ("Office supplies", ₱5,000.00)
 *
 * The Treasurer writes; the noters and the Auditor read.
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const method = getMethod(event)

  if (method === 'GET') {
    requireFinanceReader(user)
    const budget = await resolveBudget(prisma, null)
    return { lines: budget ? lineViews(budget) : [] }
  }

  if (method !== 'POST') return respond(event, 405, { error: 'Method not allowed' })
  requireFinanceManager(user)

  const body = await readJsonBody(event) ?? {}
  const budgetId = requireText(body.budgetId, 'The budget', 1, 60)
  const name = requireText(body.name, 'The line name', 2, 120)
  const category = parseEnum(body.category, LINE_CATEGORIES, 'The category', 'other')
  const allocatedCentavos = parseCentavos(body.allocatedCentavos, 'The allocation', { allowZero: true })
  const notes = optionalText(body.notes, 'The notes', 500)

  const budget = await prisma.budget.findUnique({ where: { id: budgetId } })
  if (!budget) throw new HttpError(404, 'Unknown budget')
  if (budget.status !== 'open') throw new HttpError(409, 'That budget is closed — a new line cannot be added')

  try {
    const line = await prisma.budgetLine.create({
      data: { budgetId, name, category, allocatedCentavos, notes }
    })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'finance_line_added',
        details: JSON.stringify({ budgetId, lineId: line.id, name, allocatedCentavos }),
        performedBy: user.id
      }
    })
    return respond(event, 201, { line })
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, `This budget already has a line called "${name}"`)
    throw error
  }
})
