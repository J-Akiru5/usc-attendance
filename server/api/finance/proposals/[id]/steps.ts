import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../../utils/prisma'
import { authenticate } from '../../../../utils/auth'
import { defineApiHandler, HttpError, forbidden, readJsonBody, respond } from '../../../../utils/http'
import {
  EXTERNAL_STEPS,
  SIGNATORY_LABELS,
  STEP_LABELS,
  liquidationBlockedReason,
  nextSteps,
  optionalText,
  parseDate,
  parseStep,
  proposalStatus,
  stepBlockedReason
} from '../../../../utils/finance'
import { hasCapability } from '../../../../utils/rbac'
import { financeObjectKey, financeStorage, readUploadedFile } from '../../../../utils/finance-storage'
import { auditContext, auditWrite } from '../../../../utils/audit'

/**
 * POST /api/finance/proposals/:id/steps — record one step of the proposal
 * workflow (plan §8.7). The state machine lives in `server/utils/finance.ts`:
 *
 *   decided -> noted_president / noted_adviser / noted_university_accountant
 *           -> approved -> released -> liquidated   (or rejected)
 *
 * "approved" is refused until every noted step exists. The President and the
 * Adviser record their own note in-app; the University Accountant and the Campus
 * Administrator are external, so the Treasurer records their step with the date
 * and the signed copy (the signatory's name is kept with it). Every step is
 * time-stamped and audited.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readJsonBody(event) ?? {}
  const step = parseStep(body.step)

  const isManager = hasCapability(user.capabilities ?? [], 'finance.manage')
  if (!isManager) {
    if (!hasCapability(user.capabilities ?? [], 'finance.note')) {
      throw forbidden(
        user.role === 'student'
          ? 'Access denied. This feature is for the council\'s finance officers.'
          : 'Access denied. Required capability: finance.manage or finance.note'
      )
    }
    // A noter records only their own kind of note; the external signatories'
    // steps and everything after approval belong to the Treasurer.
    if (!['noted_president', 'noted_adviser'].includes(step)) {
      throw forbidden(`Recording "${STEP_LABELS[step]}" is the Treasurer's job`)
    }
  }

  const proposal = await prisma.budgetProposal.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { actedAt: 'asc' } },
      entries: { select: { kind: true, amountCentavos: true, receiptKey: true } }
    }
  })
  if (!proposal) throw new HttpError(404, 'Unknown proposal')

  const existing = proposal.steps.map(row => row.step)
  const blocked = stepBlockedReason(existing, step)
  if (blocked) throw new HttpError(409, blocked)

  if (step === 'liquidated') {
    const liquidationBlocked = liquidationBlockedReason(proposal.entries)
    if (liquidationBlocked) throw new HttpError(409, liquidationBlocked)
  }

  const actedAt = parseDate(body.actedAt, 'The date', new Date())
  if (actedAt.getTime() > Date.now() + 24 * 3600_000) {
    throw new HttpError(400, 'The date cannot be in the future')
  }

  // The two external signatories (plan §8.7): name them and upload the signed
  // copy. No account is created for them.
  const isExternal = (EXTERNAL_STEPS as readonly string[]).includes(step)
  let signatoryName: string | null = null
  let signatoryRole: string | null = null
  let attachment: { key: string, mime: string, size: number, name: string | null } | null = null

  if (isExternal) {
    const role = step === 'approved' ? SIGNATORY_LABELS.campus_administrator : SIGNATORY_LABELS.university_accountant
    signatoryName = String(body.signatoryName ?? '').trim()
    if (signatoryName.length < 3 || signatoryName.length > 160) {
      throw new HttpError(400, `${role}'s name is required (3–160 characters)`)
    }
    signatoryRole = role

    const file = readUploadedFile(body.attachment, `The signed copy of the ${role} step`)
    if (!file) throw new HttpError(400, `Upload the signed copy of ${role}'s step`)
    const key = financeObjectKey('signed', crypto.randomUUID(), file.mime)
    await financeStorage().put(key, file.bytes, file.mime)
    attachment = { key, mime: file.mime, size: file.size, name: file.name }
  } else if (step === 'noted_president' || step === 'noted_adviser' || step === 'released' || step === 'liquidated') {
    // In-app steps belong to the officer who recorded them — never a typed name.
    signatoryName = user.name
    signatoryRole = user.position
  }

  const note = optionalText(body.note, 'The note', 1000)
  if (step === 'released' && !note) {
    throw new HttpError(400, 'A release needs its reference (voucher / check / OR number) in the note')
  }
  if (step === 'rejected' && !note) {
    throw new HttpError(400, 'A rejection needs the reason recorded in the note')
  }

  const stepNames = [...existing, step]

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.proposalStep.create({
      data: {
        proposalId: id,
        step,
        actorUserId: user.id,
        signatoryName,
        signatoryRole,
        actedAt,
        note,
        ...(attachment && {
          attachmentKey: attachment.key,
          attachmentMime: attachment.mime,
          attachmentSize: attachment.size,
          attachmentName: attachment.name
        })
      }
    })
    const updated = await tx.budgetProposal.update({
      where: { id },
      data: { status: proposalStatus(stepNames) },
      include: {
        steps: { orderBy: { actedAt: 'asc' }, include: { actor: { select: { id: true, name: true } } } }
      }
    })
    return { row, updated }
  })

  await auditWrite(prisma, {
    actor: user,
    action: 'finance_proposal_step',
    targetType: 'budget_proposal',
    targetId: id,
    details: {
      proposalId: id,
      step,
      signatoryName,
      actedAt: actedAt.toISOString(),
      hasAttachment: !!attachment,
      status: proposalStatus(stepNames),
      note
    },
    ...auditContext(event)
  })

  return respond(event, 201, {
    step: result.row,
    proposal: {
      ...result.updated,
      status: proposalStatus(stepNames),
      stepNames: result.updated.steps.map(row => row.step),
      nextSteps: nextSteps(stepNames)
    }
  })
})
