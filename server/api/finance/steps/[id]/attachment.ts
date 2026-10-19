import { getMethod, getRouterParam, setResponseHeader } from 'h3'
import { prisma } from '../../../../utils/prisma'
import { authenticate } from '../../../../utils/auth'
import { defineApiHandler, HttpError } from '../../../../utils/http'
import { requireFinanceReader } from '../../../../utils/finance'
import { financeStorage } from '../../../../utils/finance-storage'

/**
 * GET /api/finance/steps/:id/attachment — the signed copy of a noting or
 * approval step (plan §8.7). Bytes come from object storage, never the database.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') throw new HttpError(405, 'Method not allowed')

  const user = await authenticate(event)
  requireFinanceReader(user)

  const id = getRouterParam(event, 'id') ?? ''
  const step = await prisma.proposalStep.findUnique({
    where: { id },
    select: { attachmentKey: true, attachmentMime: true, attachmentName: true }
  })
  if (!step) throw new HttpError(404, 'Unknown step')
  if (!step.attachmentKey) throw new HttpError(404, 'That step has no signed copy on file')

  const bytes = await financeStorage().get(step.attachmentKey)
  setResponseHeader(event, 'Content-Type', step.attachmentMime ?? 'application/octet-stream')
  setResponseHeader(event, 'Cache-Control', 'private, max-age=60')
  if (step.attachmentName) setResponseHeader(event, 'Content-Disposition', `inline; filename="${step.attachmentName}"`)
  return bytes
})
