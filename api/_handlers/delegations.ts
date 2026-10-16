import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate } from '../_lib/auth.js'
import { badRequest, forbidden, handle, notFound } from '../_lib/http.js'
import { computeExpiry, parseScopes, requireCanDelegate } from '../_lib/delegation.js'

const PERSON = { id: true, name: true, position: true } as const

// ---------------------------------------------------------------------------
// GET  /api/delegations?eventId=  — grants for an event (President/Secretary, super_admin)
// POST /api/delegations           — grant temporary access (President/Secretary only)
// ---------------------------------------------------------------------------
export const delegations = handle(async (req: VercelRequest, res: VercelResponse) => {
  const actor = await authenticate(req)

  if (req.method === 'GET') {
    if (!actor.canDelegate && actor.role !== 'super_admin') {
      throw forbidden('Access denied. Only the President, Secretary, or an admin can view event access.')
    }
    const eventId = req.query.eventId as string
    if (!eventId) throw badRequest('eventId query parameter is required')

    const grants = await prisma.eventDelegate.findMany({
      where: { eventId },
      include: {
        user: { select: PERSON },
        granter: { select: PERSON },
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.status(200).json(grants)
  }

  if (req.method === 'POST') {
    requireCanDelegate(actor)

    const { eventId, userId } = req.body ?? {}
    if (typeof eventId !== 'string' || typeof userId !== 'string') {
      throw badRequest('eventId and userId are required')
    }
    const scopes = parseScopes(req.body.scopes)

    if (userId === actor.id) {
      throw forbidden('You cannot grant event access to yourself.')
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) throw notFound('Event not found')

    const target = await prisma.user.findUnique({ where: { id: userId } })
    if (!target || !target.active) throw notFound('Officer not found or inactive')
    if (target.role === 'student') throw badRequest('Students cannot be given officer access')

    const expiresAt = computeExpiry(event.date, req.body.expiresAt)
    const now = new Date()

    // One live grant per officer per event: a new grant replaces the old one.
    const grant = await prisma.$transaction(async (tx) => {
      const replaced = await tx.eventDelegate.updateMany({
        where: { eventId, userId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, revokedBy: actor.id },
      })
      const created = await tx.eventDelegate.create({
        data: { eventId, userId, scopes, grantedBy: actor.id, expiresAt },
        include: { user: { select: PERSON }, granter: { select: PERSON } },
      })
      await tx.auditLog.create({
        data: {
          userId,
          action: 'delegation_granted',
          details: JSON.stringify({
            eventId,
            scopes,
            expiresAt: expiresAt.toISOString(),
            grantId: created.id,
            replacedGrants: replaced.count,
          }),
          performedBy: actor.id,
        },
      })
      return created
    })

    return res.status(201).json(grant)
  }

  return res.status(405).json({ error: 'Method not allowed' })
})

// ---------------------------------------------------------------------------
// GET /api/delegations/mine  — my own active grants (any signed-in officer)
// ---------------------------------------------------------------------------
export const myDelegations = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const actor = await authenticate(req)

  const grants = await prisma.eventDelegate.findMany({
    where: { userId: actor.id, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { event: { select: { id: true, title: true, date: true } } },
    orderBy: { expiresAt: 'asc' },
  })
  return res.status(200).json(grants)
})

// ---------------------------------------------------------------------------
// GET /api/delegations/candidates — active officers who can be given access
// ---------------------------------------------------------------------------
export const delegationCandidates = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const actor = await authenticate(req)
  requireCanDelegate(actor)

  const officers = await prisma.user.findMany({
    where: { active: true, id: { not: actor.id }, role: { not: 'student' } },
    select: PERSON,
    orderBy: { name: 'asc' },
  })
  return res.status(200).json(officers)
})

// ---------------------------------------------------------------------------
// DELETE /api/delegations/:id  — revoke immediately (President/Secretary only)
// ---------------------------------------------------------------------------
export const delegationById = handle(
  async (req: VercelRequest, res: VercelResponse, id: string) => {
    if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })
    const actor = await authenticate(req)
    requireCanDelegate(actor)

    const grant = await prisma.eventDelegate.findUnique({ where: { id } })
    if (!grant) throw notFound('Grant not found')

    // Idempotent: revoking an already-revoked grant just returns it.
    if (grant.revokedAt) return res.status(200).json(grant)

    const now = new Date()
    const revoked = await prisma.$transaction(async (tx) => {
      const updated = await tx.eventDelegate.update({
        where: { id },
        data: { revokedAt: now, revokedBy: actor.id },
      })
      await tx.auditLog.create({
        data: {
          userId: grant.userId,
          action: 'delegation_revoked',
          details: JSON.stringify({ eventId: grant.eventId, grantId: id }),
          performedBy: actor.id,
        },
      })
      return updated
    })
    return res.status(200).json(revoked)
  }
)
