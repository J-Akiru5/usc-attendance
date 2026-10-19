import { getMethod, getQuery } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { badRequest, defineApiHandler, forbidden, HttpError, respond, readJsonBody } from '../../../utils/http'
import { auditContext, auditWrite } from '../../../utils/audit'
import { parseRectificationRequest } from '../../../utils/privacy'

/**
 * GET  /api/privacy/requests — the staff rectification queue
 * POST /api/privacy/requests — a student files a rectification request
 *
 * A request is a *proposal*, not an edit: the student never writes the profile
 * directly. The decision route applies the change after review, which is what
 * makes the audit row meaningful (plan §8.9, benchmark BC-11).
 */
export default defineApiHandler(async (event) => {
  const method = getMethod(event)
  const user = await authenticate(event)

  if (method === 'GET') {
    requireStaff(user)

    const query = getQuery(event)
    const status = typeof query.status === 'string' ? query.status.trim().toLowerCase() : 'pending'
    if (!['pending', 'decided', 'all'].includes(status)) {
      throw badRequest('status must be pending, decided or all')
    }

    const requests = await prisma.privacyRequest.findMany({
      where: status === 'all'
        ? {}
        : status === 'pending'
          ? { status: 'pending' }
          : { status: { in: ['accepted', 'rejected'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true,
        kind: true,
        field: true,
        currentValue: true,
        proposedValue: true,
        note: true,
        status: true,
        reason: true,
        createdAt: true,
        decidedAt: true,
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: { select: { studentNo: true, yearLevel: true, section: { select: { name: true } } } }
          }
        },
        decider: { select: { id: true, name: true } }
      }
    })

    return { requests }
  }

  if (method === 'POST') {
    if (user.role !== 'student') {
      throw forbidden('Only a student account can file a rectification request')
    }

    const parsed = parseRectificationRequest(await readJsonBody(event))

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: {
        studentNo: true,
        yearLevel: true,
        sectionId: true,
        section: { select: { name: true } }
      }
    })
    if (!profile) throw forbidden('Your student profile is incomplete — contact the council office.')

    const duplicate = await prisma.privacyRequest.findFirst({
      where: { userId: user.id, field: parsed.field, status: 'pending' },
      select: { id: true }
    })
    if (duplicate) {
      throw new HttpError(409, 'You already have a pending request for that field.')
    }

    const currentValue = parsed.field === 'name'
      ? user.name
      : parsed.field === 'studentNo'
        ? profile.studentNo
        : parsed.field === 'yearLevel'
          ? profile.yearLevel === null ? null : String(profile.yearLevel)
          : profile.section?.name ?? null

    const request = await prisma.privacyRequest.create({
      data: {
        userId: user.id,
        kind: 'rectification',
        field: parsed.field,
        currentValue,
        proposedValue: parsed.proposedValue,
        note: parsed.note
      }
    })

    await auditWrite(prisma, {
      actor: user,
      action: 'privacy_request_filed',
      targetType: 'privacy_request',
      targetId: request.id,
      userId: user.id,
      // The proposed value is already stored on the request; the audit row says
      // which field changed hands, not what the student wrote.
      details: { field: request.field, kind: request.kind },
      ...auditContext(event)
    })

    return respond(event, 201, request)
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
