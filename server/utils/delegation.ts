import { HttpError, badRequest } from './http'
import { isStaff, type Actor } from './attendance-rules'
import { manilaDayRange } from './time'

export const DELEGATION_SCOPES = ['scan', 'manual_checkin', 'view_roster', 'export'] as const
export type DelegationScope = (typeof DELEGATION_SCOPES)[number]

/** Longest a grant may outlive the event's Manila calendar day. */
const MAX_GRACE_MS = 24 * 60 * 60 * 1000

export interface GrantLike {
  eventId: string
  scopes: string[]
  expiresAt: Date
  revokedAt: Date | null
}

/** The slice of Prisma these helpers need — lets tests pass a small fake. */
export interface DelegationDb {
  eventDelegate: {
    findFirst(args: {
      where: {
        userId: string
        eventId: string
        revokedAt: null
        expiresAt: { gt: Date }
        scopes: { has: string }
      }
      select: { id: true }
    }): Promise<{ id: string } | null>
  }
  auditLog: {
    create(args: {
      data: { userId: string, action: string, details: string, performedBy: string }
    }): Promise<unknown>
  }
}

/** Validate a requested scope list: non-empty, known values only, de-duplicated. */
export function parseScopes(input: unknown): DelegationScope[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw badRequest('scopes must be a non-empty array')
  }
  const out = new Set<DelegationScope>()
  for (const s of input) {
    if (typeof s !== 'string' || !(DELEGATION_SCOPES as readonly string[]).includes(s)) {
      throw badRequest(`Unknown scope: ${String(s)}`)
    }
    out.add(s as DelegationScope)
  }
  return [...out]
}

/**
 * When a grant ends. Defaults to the end of the event's Manila calendar day.
 * An explicit expiry must be in the future and no later than 24h after that day ends.
 */
export function computeExpiry(eventDate: Date, requested: unknown, now: Date = new Date()): Date {
  const dayEnd = manilaDayRange(eventDate).lt
  if (requested === undefined || requested === null || requested === '') {
    if (dayEnd.getTime() <= now.getTime()) {
      throw badRequest('This event has already ended. Pass an explicit expiresAt to grant access.')
    }
    return dayEnd
  }
  const expires = new Date(requested as string)
  if (Number.isNaN(expires.getTime())) {
    throw badRequest('expiresAt is not a valid date')
  }
  if (expires.getTime() <= now.getTime()) {
    throw badRequest('expiresAt must be in the future')
  }
  if (expires.getTime() > dayEnd.getTime() + MAX_GRACE_MS) {
    throw badRequest('expiresAt is too far past the event day (max 24h after it ends)')
  }
  return expires
}

/** Only officers flagged canDelegate (President/Secretary) may grant or revoke. */
export function requireCanDelegate(actor: { canDelegate?: boolean }): void {
  if (actor.canDelegate !== true) {
    throw new HttpError(403, 'Access denied. Only the President or Secretary can manage event access.')
  }
}

export function isGrantActive(grant: Pick<GrantLike, 'expiresAt' | 'revokedAt'>, now: Date = new Date()): boolean {
  return grant.revokedAt === null && grant.expiresAt.getTime() > now.getTime()
}

export function grantAllows(
  grant: GrantLike,
  eventId: string,
  scope: DelegationScope,
  now: Date = new Date()
): boolean {
  return grant.eventId === eventId && isGrantActive(grant, now) && grant.scopes.includes(scope)
}

/**
 * Whether `actor` may use `scope` on `eventId`. Staff keep the access they
 * have always had; everyone else needs an active, un-revoked grant for that
 * exact event and scope, checked against the database on every request so a
 * revocation takes effect immediately.
 */
export async function hasEventScope(
  db: DelegationDb,
  actor: Actor,
  eventId: string,
  scope: DelegationScope,
  now: Date = new Date()
): Promise<{ allowed: boolean, viaDelegation: boolean }> {
  if (isStaff(actor)) return { allowed: true, viaDelegation: false }
  const grant = await db.eventDelegate.findFirst({
    where: {
      userId: actor.id,
      eventId,
      revokedAt: null,
      expiresAt: { gt: now },
      scopes: { has: scope }
    },
    select: { id: true }
  })
  return { allowed: grant !== null, viaDelegation: grant !== null }
}

export async function requireEventScope(
  db: DelegationDb,
  actor: Actor,
  eventId: string,
  scope: DelegationScope,
  now: Date = new Date()
): Promise<{ viaDelegation: boolean }> {
  const { allowed, viaDelegation } = await hasEventScope(db, actor, eventId, scope, now)
  if (!allowed) {
    throw new HttpError(
      403,
      `Access denied. You have no active "${scope}" access for this event.`
    )
  }
  return { viaDelegation }
}

/** Audit trail for actions taken under a temporary grant (not for normal staff actions). */
export async function auditDelegationUse(
  db: DelegationDb,
  actor: Actor,
  eventId: string,
  scope: DelegationScope,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: 'delegation_used',
      details: JSON.stringify({ eventId, scope, ...extra }),
      performedBy: actor.id
    }
  })
}
