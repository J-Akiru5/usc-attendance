import { getMethod, getQuery } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import {
  nextSteps,
  optionalText,
  parseCentavos,
  parseDate,
  proposalStatus,
  requireFinanceManager,
  requireFinanceReader,
  requireText
} from '../../../utils/finance'
import { financeObjectKey, financeStorage, readUploadedFile } from '../../../utils/finance-storage'

/**
 * /api/finance/proposals — budget proposals (plan §8.7).
 *   GET   ?budgetId=|status=|eventId=   the register, with every step it has
 *   POST                                record a proposal the body decided on
 *
 * Creating one records the first step of the state machine ("decided by the
 * body"), with the minutes it came from; the noting and approval steps are
 * recorded on /api/finance/proposals/:id/steps.
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const method = getMethod(event)

  if (method === 'GET') {
    requireFinanceReader(user)
    const query = getQuery(event)
    const budgetId = typeof query.budgetId === 'string' ? query.budgetId : ''
    const status = typeof query.status === 'string' ? query.status : ''
    const eventId = typeof query.eventId === 'string' ? query.eventId : ''

    const proposals = await prisma.budgetProposal.findMany({
      where: {
        ...(budgetId ? { budgetId } : {}),
        ...(status ? { status } : {}),
        ...(eventId ? { eventId } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        line: { select: { id: true, name: true } },
        event: { select: { id: true, title: true, date: true } },
        creator: { select: { id: true, name: true } },
        steps: {
          orderBy: { actedAt: 'asc' },
          include: { actor: { select: { id: true, name: true } } }
        }
      }
    })

    return {
      proposals: proposals.map(proposal => ({
        ...proposal,
        stepNames: proposal.steps.map(step => step.step),
        nextSteps: nextSteps(proposal.steps.map(step => step.step))
      }))
    }
  }

  if (method !== 'POST') return respond(event, 405, { error: 'Method not allowed' })
  requireFinanceManager(user)

  const body = await readJsonBody(event) ?? {}
  const budgetId = requireText(body.budgetId, 'The budget', 1, 60)
  const title = requireText(body.title, 'The title', 4, 160)
  const description = requireText(body.description, 'The description', 10, 2000)
  const amountCentavos = parseCentavos(body.amountCentavos, 'The amount')
  const minutesReference = requireText(body.minutesReference, 'The minutes reference', 3, 300)
  const decidedAt = parseDate(body.decidedAt, 'The meeting date', new Date())
  if (decidedAt.getTime() > Date.now() + 24 * 3600_000) throw new HttpError(400, 'The meeting date cannot be in the future')
  const projectName = optionalText(body.projectName, 'The project name', 160)
  const lineId = body.lineId ? String(body.lineId) : null
  const eventId = body.eventId ? String(body.eventId) : null

  const budget = await prisma.budget.findUnique({ where: { id: budgetId } })
  if (!budget) throw new HttpError(404, 'Unknown budget')
  if (budget.status !== 'open') throw new HttpError(409, 'That budget is closed — a new proposal cannot be raised')

  if (lineId) {
    const line = await prisma.budgetLine.findUnique({ where: { id: lineId } })
    if (!line || line.budgetId !== budgetId) throw new HttpError(400, 'That line belongs to another budget')
  }
  if (eventId) {
    const row = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!row) throw new HttpError(400, 'Unknown event')
  }

  // The signed copy of the minutes is optional — the reference is what the
  // diagram asks for ("link minutes") — but when one is sent it is stored
  // outside the database like every other upload.
  const minutesFile = readUploadedFile(body.minutes, 'The minutes copy')
  let attachment: { key: string, mime: string, size: number, name: string | null } | null = null
  if (minutesFile) {
    const key = financeObjectKey('signed', crypto.randomUUID(), minutesFile.mime)
    await financeStorage().put(key, minutesFile.bytes, minutesFile.mime)
    attachment = { key, mime: minutesFile.mime, size: minutesFile.size, name: minutesFile.name }
  }

  const proposal = await prisma.budgetProposal.create({
    data: {
      budgetId,
      lineId,
      eventId,
      projectName,
      title,
      description,
      amountCentavos,
      status: 'decided',
      createdBy: user.id,
      steps: {
        create: {
          step: 'decided',
          actorUserId: user.id,
          actedAt: decidedAt,
          note: minutesReference,
          ...(attachment && {
            attachmentKey: attachment.key,
            attachmentMime: attachment.mime,
            attachmentSize: attachment.size,
            attachmentName: attachment.name
          })
        }
      }
    },
    include: { steps: { include: { actor: { select: { id: true, name: true } } } } }
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'finance_proposal_created',
      details: JSON.stringify({
        proposalId: proposal.id,
        budgetId,
        lineId,
        eventId,
        title,
        amountCentavos,
        minutesReference
      }),
      performedBy: user.id
    }
  })

  return respond(event, 201, {
    proposal: {
      ...proposal,
      status: proposalStatus(proposal.steps.map(step => step.step)),
      stepNames: proposal.steps.map(step => step.step),
      nextSteps: nextSteps(proposal.steps.map(step => step.step))
    }
  })
})
