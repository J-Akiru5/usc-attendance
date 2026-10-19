import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, HttpError, respond } from '../../../utils/http'
import { formatPeso } from '../../../utils/fines'
import {
  nextSteps,
  proposalStatus,
  requireFinanceReader
} from '../../../utils/finance'

/**
 * GET /api/finance/proposals/:id — one proposal in full (plan §8.7): the steps
 * that make up its trail (who did what, when, and whether a signed copy is on
 * file), the entries charged to it, and the reconciliation of the two.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireFinanceReader(user)

  const id = getRouterParam(event, 'id') ?? ''
  const proposal = await prisma.budgetProposal.findUnique({
    where: { id },
    include: {
      line: { select: { id: true, name: true, allocatedCentavos: true } },
      event: { select: { id: true, title: true, date: true } },
      creator: { select: { id: true, name: true } },
      budget: { select: { id: true, status: true, semester: { select: { id: true, name: true } } } },
      steps: {
        orderBy: { actedAt: 'asc' },
        include: { actor: { select: { id: true, name: true, position: true } } }
      },
      entries: {
        orderBy: { spentAt: 'asc' },
        include: {
          line: { select: { id: true, name: true } },
          recorder: { select: { id: true, name: true } }
        }
      }
    }
  })
  if (!proposal) throw new HttpError(404, 'Unknown proposal')

  const stepNames = proposal.steps.map(step => step.step)
  const spentCentavos = proposal.entries.filter(e => e.kind === 'expense').reduce((sum, e) => sum + e.amountCentavos, 0)
  const receivedCentavos = proposal.entries.filter(e => e.kind === 'income').reduce((sum, e) => sum + e.amountCentavos, 0)

  return {
    proposal: {
      ...proposal,
      status: proposalStatus(stepNames),
      stepNames,
      nextSteps: nextSteps(stepNames),
      steps: proposal.steps.map(step => ({ ...step, hasAttachment: !!step.attachmentKey })),
      entries: proposal.entries.map(entry => ({ ...entry, hasReceipt: !!entry.receiptKey }))
    },
    reconciliation: {
      proposedCentavos: proposal.amountCentavos,
      spentCentavos,
      receivedCentavos,
      varianceCentavos: proposal.amountCentavos - spentCentavos,
      proposedPesos: formatPeso(proposal.amountCentavos),
      spentPesos: formatPeso(spentCentavos),
      variancePesos: formatPeso(proposal.amountCentavos - spentCentavos),
      receiptsMissing: proposal.entries.filter(e => e.kind === 'expense' && !e.receiptKey).length
    }
  }
})
