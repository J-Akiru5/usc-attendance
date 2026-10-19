import { getMethod, getRouterParam, setResponseHeader } from 'h3'
import { prisma } from '../../../../utils/prisma'
import { authenticate } from '../../../../utils/auth'
import { defineApiHandler, HttpError } from '../../../../utils/http'
import { requireFinanceReader } from '../../../../utils/finance'
import { financeStorage } from '../../../../utils/finance-storage'

/**
 * GET /api/finance/entries/:id/receipt — the uploaded receipt (plan §8.7).
 * Bytes come from object storage, never the database.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') throw new HttpError(405, 'Method not allowed')

  const user = await authenticate(event)
  requireFinanceReader(user)

  const id = getRouterParam(event, 'id') ?? ''
  const entry = await prisma.budgetEntry.findUnique({
    where: { id },
    select: { receiptKey: true, receiptMime: true, receiptName: true }
  })
  if (!entry) throw new HttpError(404, 'Unknown entry')
  if (!entry.receiptKey) throw new HttpError(404, 'This entry has no receipt')

  const bytes = await financeStorage().get(entry.receiptKey)
  setResponseHeader(event, 'Content-Type', entry.receiptMime ?? 'application/octet-stream')
  setResponseHeader(event, 'Cache-Control', 'private, max-age=60')
  if (entry.receiptName) setResponseHeader(event, 'Content-Disposition', `inline; filename="${entry.receiptName}"`)
  return bytes
})
