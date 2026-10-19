import { getMethod, getQuery } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { formatPeso } from '../../../utils/fines'
import {
  INCOME_SOURCES,
  lineTotals,
  parseCentavos,
  parseDate,
  parseEnum,
  planExpense,
  requireFinanceManager,
  requireFinanceReader,
  requireText
} from '../../../utils/finance'
import { financeObjectKey, financeStorage, readUploadedFile } from '../../../utils/finance-storage'

/**
 * /api/finance/entries — money actually moved (plan §8.7).
 *   GET  ?budgetId=|lineId=|proposalId=|kind=   the ledger
 *   POST                                        record income or an expense
 *
 * An expense may not exceed what the line has left (the §8.7 acceptance rule):
 * it is refused with 409 unless the caller passes `override: true` and a reason,
 * which is kept on the row and written to the audit trail. Expenses charged to a
 * proposal are only allowed once that proposal has been released.
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const method = getMethod(event)

  if (method === 'GET') {
    requireFinanceReader(user)
    const query = getQuery(event)
    const lineId = typeof query.lineId === 'string' ? query.lineId : ''
    const proposalId = typeof query.proposalId === 'string' ? query.proposalId : ''
    const budgetId = typeof query.budgetId === 'string' ? query.budgetId : ''
    const kind = typeof query.kind === 'string' ? query.kind : ''

    const entries = await prisma.budgetEntry.findMany({
      where: {
        ...(lineId ? { lineId } : {}),
        ...(proposalId ? { proposalId } : {}),
        ...(budgetId ? { line: { budgetId } } : {}),
        ...(kind ? { kind } : {})
      },
      orderBy: { spentAt: 'desc' },
      take: 500,
      include: {
        line: { select: { id: true, name: true, budgetId: true } },
        recorder: { select: { id: true, name: true } },
        proposal: { select: { id: true, title: true, status: true } }
      }
    })

    const expenses = entries.filter(e => e.kind === 'expense').reduce((sum, e) => sum + e.amountCentavos, 0)
    const income = entries.filter(e => e.kind === 'income').reduce((sum, e) => sum + e.amountCentavos, 0)
    return {
      entries: entries.map(entry => ({ ...entry, hasReceipt: !!entry.receiptKey })),
      totals: {
        count: entries.length,
        expenseCentavos: expenses,
        incomeCentavos: income,
        expensePesos: formatPeso(expenses),
        incomePesos: formatPeso(income)
      }
    }
  }

  if (method !== 'POST') return respond(event, 405, { error: 'Method not allowed' })
  requireFinanceManager(user)

  const body = await readJsonBody(event) ?? {}
  const lineId = requireText(body.lineId, 'The budget line', 1, 60)
  const kind = parseEnum(body.kind, ['income', 'expense'] as const, 'The kind of entry')
  const amountCentavos = parseCentavos(body.amountCentavos, 'The amount')
  const description = requireText(body.description, 'The description', 3, 300)
  const source = kind === 'income'
    ? parseEnum(body.source, INCOME_SOURCES, 'The income source', 'other')
    : null
  const spentAt = parseDate(body.spentAt, 'The date', new Date())
  const override = body.override === true
  const overrideReason = typeof body.overrideReason === 'string' ? body.overrideReason : null

  const line = await prisma.budgetLine.findUnique({
    where: { id: lineId },
    include: { budget: true, entries: { select: { kind: true, amountCentavos: true } } }
  })
  if (!line) throw new HttpError(404, 'Unknown budget line')
  if (line.archived) throw new HttpError(409, 'That budget line is archived — pick another one')
  if (line.budget.status !== 'open') throw new HttpError(409, 'That budget is closed — no new entries can be recorded')

  let proposal: { id: string, status: string, budgetId: string, lineId: string | null } | null = null
  if (body.proposalId) {
    proposal = await prisma.budgetProposal.findUnique({
      where: { id: String(body.proposalId) },
      select: { id: true, status: true, budgetId: true, lineId: true }
    })
    if (!proposal) throw new HttpError(404, 'Unknown proposal')
    if (proposal.budgetId !== line.budgetId) throw new HttpError(400, 'That proposal belongs to another budget')
    if (proposal.status !== 'released' && proposal.status !== 'liquidated') {
      throw new HttpError(409, 'The proposal must be released before expenses can be charged to it')
    }
  }

  // The §8.7 acceptance rule, enforced by the tested planner.
  let appliedOverride: string | null = null
  if (kind === 'expense') {
    const totals = lineTotals(line.allocatedCentavos, line.entries)
    const plan = planExpense({
      remainingCentavos: totals.remainingCentavos,
      amountCentavos,
      override,
      overrideReason
    })
    appliedOverride = plan.overrideReason
  }

  // Receipts go to object storage (never the database, plan §11.1).
  let receipt: { key: string, mime: string, size: number, name: string | null } | null = null
  const file = readUploadedFile(body.receipt, 'The receipt')
  if (file) {
    const key = financeObjectKey('receipt', crypto.randomUUID(), file.mime)
    await financeStorage().put(key, file.bytes, file.mime)
    receipt = { key, mime: file.mime, size: file.size, name: file.name }
  }

  const entry = await prisma.budgetEntry.create({
    data: {
      lineId,
      kind,
      amountCentavos,
      description,
      source,
      spentAt,
      proposalId: proposal?.id ?? null,
      overrideReason: appliedOverride,
      ...(receipt && {
        receiptKey: receipt.key,
        receiptMime: receipt.mime,
        receiptSize: receipt.size,
        receiptName: receipt.name
      }),
      recordedBy: user.id
    }
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'finance_entry_recorded',
      details: JSON.stringify({
        entryId: entry.id,
        lineId,
        kind,
        amountCentavos,
        proposalId: proposal?.id ?? null,
        hasReceipt: !!receipt
      }),
      performedBy: user.id
    }
  })

  if (appliedOverride) {
    // An override is never silent: the numbers that made it necessary are kept.
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'finance_budget_override',
        details: JSON.stringify({
          entryId: entry.id,
          lineId,
          lineName: line.name,
          amountCentavos,
          allocatedCentavos: line.allocatedCentavos,
          reason: appliedOverride
        }),
        performedBy: user.id
      }
    })
  }

  return respond(event, 201, { entry: { ...entry, hasReceipt: !!receipt }, overridden: !!appliedOverride })
})
