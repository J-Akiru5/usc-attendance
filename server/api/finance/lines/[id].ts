import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, HttpError, isUniqueViolation, readJsonBody, respond } from '../../../utils/http'
import {
  LINE_CATEGORIES,
  lineTotals,
  optionalText,
  parseCentavos,
  parseEnum,
  requireFinanceManager,
  requireText
} from '../../../utils/finance'

/**
 * /api/finance/lines/:id — one budget line (plan §8.7).
 *   PUT     reallocate, rename, recategorise or archive
 *   DELETE  archive (never delete: its receipts and proposals keep their home)
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const id = getRouterParam(event, 'id') ?? ''
  const method = getMethod(event)

  const line = await prisma.budgetLine.findUnique({ where: { id }, include: { entries: true } })
  if (!line) throw new HttpError(404, 'Unknown budget line')

  if (method === 'PUT') {
    requireFinanceManager(user)
    const body = await readJsonBody(event) ?? {}
    const name = body.name === undefined ? line.name : requireText(body.name, 'The line name', 2, 120)
    const category = body.category === undefined
      ? line.category
      : parseEnum(body.category, LINE_CATEGORIES, 'The category')
    const allocatedCentavos = body.allocatedCentavos === undefined
      ? line.allocatedCentavos
      : parseCentavos(body.allocatedCentavos, 'The allocation', { allowZero: true })
    const notes = body.notes === undefined ? line.notes : optionalText(body.notes, 'The notes', 500)
    const archived = body.archived === undefined ? line.archived : body.archived === true

    try {
      const updated = await prisma.budgetLine.update({
        where: { id },
        data: { name, category, allocatedCentavos, notes, archived }
      })
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'finance_line_updated',
          details: JSON.stringify({
            lineId: id,
            before: {
              name: line.name,
              category: line.category,
              allocatedCentavos: line.allocatedCentavos,
              archived: line.archived
            },
            after: { name, category, allocatedCentavos, archived }
          }),
          performedBy: user.id
        }
      })
      return { line: updated, totals: lineTotals(updated.allocatedCentavos, line.entries) }
    } catch (error) {
      if (isUniqueViolation(error)) throw new HttpError(409, `This budget already has a line called "${name}"`)
      throw error
    }
  }

  if (method === 'DELETE') {
    requireFinanceManager(user)
    if (line.archived) return { line, archived: true }
    const archived = await prisma.budgetLine.update({ where: { id }, data: { archived: true } })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'finance_line_archived',
        details: JSON.stringify({ lineId: id, name: line.name, entries: line.entries.length }),
        performedBy: user.id
      }
    })
    return { line: archived, archived: true }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
