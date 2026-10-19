import type { Prisma } from '@prisma/client'
import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import {
  defineApiHandler,
  HttpError,
  isUniqueViolation,
  notFound,
  readJsonBody,
  respond
} from '../../../utils/http'
import { auditContext, auditWrite } from '../../../utils/audit'
import { parseDecision, type RectificationDecision } from '../../../utils/privacy'

interface PendingRequest {
  id: string
  userId: string
  field: string
  proposedValue: string
}

interface CorrectionEffect {
  clearedSection?: boolean
}

/**
 * Apply an accepted correction. Everything happens inside the decision
 * transaction: if the value no longer fits the reference data, the request
 * stays pending and the status update rolls back with it.
 */
async function applyCorrection(tx: Prisma.TransactionClient, request: PendingRequest): Promise<CorrectionEffect> {
  if (request.field === 'name') {
    await tx.user.update({
      where: { id: request.userId },
      data: { name: request.proposedValue }
    })
    return {}
  }

  const profile = await tx.studentProfile.findUnique({
    where: { userId: request.userId },
    select: { programId: true, sectionId: true, programRef: { select: { yearLevels: true } } }
  })
  if (!profile) throw new HttpError(409, 'This student has no profile row to correct.')

  if (request.field === 'studentNo') {
    await tx.studentProfile.update({
      where: { userId: request.userId },
      data: { studentNo: request.proposedValue }
    })
    return {}
  }

  if (request.field === 'yearLevel') {
    const yearLevel = Number(request.proposedValue)
    const maxYear = profile.programRef?.yearLevels ?? 6
    if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > maxYear) {
      throw new HttpError(400, `That year level is no longer valid for this program (1 to ${maxYear}).`)
    }
    // A section belongs to a year level. If the current one is from the old
    // year, clear it rather than leave an impossible placement behind; the
    // audit row records that this happened.
    let clearsSection = false
    if (profile.sectionId) {
      const section = await tx.section.findUnique({
        where: { id: profile.sectionId },
        select: { yearLevel: true }
      })
      clearsSection = !!section && section.yearLevel !== yearLevel
    }
    await tx.studentProfile.update({
      where: { userId: request.userId },
      data: { yearLevel, ...(clearsSection && { sectionId: null }) }
    })
    return { clearedSection: clearsSection }
  }

  if (request.field === 'section') {
    const sections = await tx.section.findMany({
      where: {
        name: { equals: request.proposedValue, mode: 'insensitive' },
        archived: false,
        ...(profile.programId ? { programId: profile.programId } : {})
      },
      select: { id: true, yearLevel: true }
    })
    if (sections.length === 0) {
      throw new HttpError(400, 'That section is not in the current council list. Check the exact name with the office.')
    }
    if (sections.length > 1) {
      throw new HttpError(400, 'That section name matches more than one offering. Ask the office to choose the exact one.')
    }
    const section = sections[0]!
    await tx.studentProfile.update({
      where: { userId: request.userId },
      data: { sectionId: section.id, yearLevel: section.yearLevel }
    })
    return { clearedSection: false }
  }

  throw new HttpError(400, 'That field cannot be applied by this route.')
}

/**
 * PATCH /api/privacy/requests/:id — a staff decision on a rectification request.
 *
 * `{ status: 'accepted' | 'rejected', reason }`. Both outcomes require a
 * reason. Acceptance applies the change, then writes exactly one audit row
 * naming the requester (`userId` / details.requesterId), the decider
 * (`performedBy` / details.deciderId) and the reason — all in the same
 * transaction as the change itself.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'PATCH') return respond(event, 405, { error: 'Method not allowed' })

  const actor = await authenticate(event)
  requireStaff(actor)

  const id = getRouterParam(event, 'id') ?? ''
  const request = await prisma.privacyRequest.findUnique({ where: { id } })
  if (!request) throw notFound('Rectification request not found')
  if (request.status !== 'pending') {
    throw new HttpError(409, 'This request has already been decided.')
  }

  const decision: RectificationDecision = parseDecision(await readJsonBody(event))
  const context = auditContext(event)
  const decidedAt = new Date()

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Compare-and-set the decision first: two officers clicking at once must
      // not both apply a correction.
      const claimed = await tx.privacyRequest.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: decision.status,
          reason: decision.reason,
          decidedBy: actor.id,
          decidedAt
        }
      })
      if (claimed.count === 0) throw new HttpError(409, 'This request has already been decided.')

      const effect: CorrectionEffect = decision.status === 'accepted'
        ? await applyCorrection(tx, {
            id: request.id,
            userId: request.userId,
            field: request.field,
            proposedValue: request.proposedValue
          })
        : {}

      await auditWrite(tx, {
        actor,
        action: decision.status === 'accepted' ? 'privacy_request_accepted' : 'privacy_request_rejected',
        targetType: 'privacy_request',
        targetId: id,
        userId: request.userId,
        details: {
          requesterId: request.userId,
          deciderId: actor.id,
          field: request.field,
          status: decision.status,
          reason: decision.reason,
          ...(effect.clearedSection !== undefined && { clearedSection: effect.clearedSection })
        },
        ...context
      })

      return tx.privacyRequest.findUniqueOrThrow({ where: { id } })
    })

    return updated
  } catch (err: unknown) {
    if (err instanceof HttpError) throw err
    if (isUniqueViolation(err)) {
      throw new HttpError(409, 'That student number is already registered to someone else.')
    }
    throw err
  }
})
