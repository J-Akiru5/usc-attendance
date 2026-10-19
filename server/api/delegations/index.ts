import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, forbidden, notFound, readJsonBody, respond } from '../../utils/http'
import { computeExpiry, parseScopes, requireCanDelegate } from '../../utils/delegation'
import { auditContext, auditWrite } from '../../utils/audit'

const PERSON = { id: true, name: true, position: true } as const

// ---------------------------------------------------------------------------
// GET  /api/delegations?eventId=  — grants for an event (President/Secretary, super_admin)
// POST /api/delegations           — grant temporary access (President/Secretary only)
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const actor = await authenticate(event)

  if (getMethod(event) === 'GET') {
    if (!actor.canDelegate && actor.role !== 'super_admin') {
      throw forbidden('Access denied. Only the President, Secretary, or an admin can view event access.')
    }
    const query = getQuery(event)
    const eventId = query.eventId as string
    if (!eventId) throw badRequest('eventId query parameter is required')

    const grants = await prisma.eventDelegate.findMany({
      where: { eventId },
      include: {
        user: { select: PERSON },
        granter: { select: PERSON }
      },
      orderBy: { createdAt: 'desc' }
    })
    return grants
  }

  if (getMethod(event) === 'POST') {
    requireCanDelegate(actor)

    const body = await readJsonBody(event) ?? {}
    const { eventId, userId } = body
    if (typeof eventId !== 'string' || typeof userId !== 'string') {
      throw badRequest('eventId and userId are required')
    }
    const scopes = parseScopes(body.scopes)

    if (userId === actor.id) {
      throw forbidden('You cannot grant event access to yourself.')
    }

    const eventRow = await prisma.event.findUnique({ where: { id: eventId } })
    if (!eventRow) throw notFound('Event not found')

    const target = await prisma.user.findUnique({ where: { id: userId } })
    if (!target || !target.active) throw notFound('Officer not found or inactive')
    if (target.role === 'student') throw badRequest('Students cannot be given officer access')

    const expiresAt = computeExpiry(eventRow.date, body.expiresAt)
    const now = new Date()

    // One live grant per officer per event: a new grant replaces the old one.
    const grant = await prisma.$transaction(async (tx) => {
      const replaced = await tx.eventDelegate.updateMany({
        where: { eventId, userId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, revokedBy: actor.id }
      })
      const created = await tx.eventDelegate.create({
        data: { eventId, userId, scopes, grantedBy: actor.id, expiresAt },
        include: { user: { select: PERSON }, granter: { select: PERSON } }
      })
      await auditWrite(tx, {
        actor,
        action: 'delegation_granted',
        targetType: 'delegation_grant',
        targetId: created.id,
        userId,
        details: {
          eventId,
          scopes,
          expiresAt: expiresAt.toISOString(),
          replacedGrants: replaced.count
        },
        ...auditContext(event)
      })
      return created
    })

    return respond(event, 201, grant)
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
