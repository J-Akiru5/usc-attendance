import { getMethod, getQuery, setResponseHeader } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, notFound, respond } from '../../utils/http'
import { lineTotals, liquidationModel, requireFinanceReader } from '../../utils/finance'
import { buildTableReport, parseFormat } from '../../utils/report'

/**
 * GET /api/finance/liquidation?proposalId=&format=csv|xlsx|pdf — the liquidation
 * report of one proposal (plan §8.7): the approval trail, every expense with its
 * receipt, the budget lines involved and the reconciliation between what the
 * body approved and what was actually spent.
 *
 * The numbers come from the same tested helpers the UI uses, so the report can
 * never disagree with the screen it is exported from.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireFinanceReader(user)

  const query = getQuery(event)
  const proposalId = typeof query.proposalId === 'string' ? query.proposalId : ''
  if (!proposalId) throw badRequest('proposalId is required')

  const format = parseFormat(query.format)
  if (!format) throw badRequest('format must be csv, xlsx or pdf')

  const proposal = await prisma.budgetProposal.findUnique({
    where: { id: proposalId },
    include: {
      line: { select: { id: true, name: true, allocatedCentavos: true } },
      event: { select: { id: true, title: true, date: true } },
      steps: { orderBy: { actedAt: 'asc' }, include: { actor: { select: { id: true, name: true } } } },
      entries: { orderBy: { spentAt: 'asc' }, include: { line: { select: { id: true, name: true, allocatedCentavos: true } } } }
    }
  })
  if (!proposal) throw notFound('Unknown proposal')

  // Every line the proposal touched, with the totals it reconciles against.
  const lineIds = new Set<string>()
  if (proposal.line) lineIds.add(proposal.line.id)
  for (const entry of proposal.entries) lineIds.add(entry.line.id)

  const lines = lineIds.size
    ? await prisma.budgetLine.findMany({
        where: { id: { in: [...lineIds] } },
        include: { entries: { select: { kind: true, amountCentavos: true } } }
      })
    : []

  const model = liquidationModel({
    proposal: {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      amountCentavos: proposal.amountCentavos,
      status: proposal.status,
      projectName: proposal.projectName
    },
    event: proposal.event,
    line: proposal.line,
    steps: proposal.steps.map(step => ({
      step: step.step,
      actedAt: step.actedAt,
      actorName: step.actor?.name ?? null,
      signatoryName: step.signatoryName,
      signatoryRole: step.signatoryRole,
      note: step.note,
      hasAttachment: !!step.attachmentKey
    })),
    entries: proposal.entries.map(entry => ({
      kind: entry.kind,
      amountCentavos: entry.amountCentavos,
      description: entry.description,
      spentAt: entry.spentAt,
      lineName: entry.line.name,
      receiptName: entry.receiptName,
      receiptKey: entry.receiptKey
    })),
    lines: lines.map((line) => {
      const totals = lineTotals(line.allocatedCentavos, line.entries)
      return {
        name: line.name,
        allocatedCentavos: line.allocatedCentavos,
        incomeCentavos: totals.incomeCentavos,
        expenseCentavos: totals.expenseCentavos,
        remainingCentavos: totals.remainingCentavos
      }
    }),
    preparedBy: user.name
  })

  const report = await buildTableReport(model, format)
  setResponseHeader(event, 'Content-Type', report.contentType)
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${model.stem}.${report.extension}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return report.body
})
