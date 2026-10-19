import type { H3Event } from 'h3'
import { getRequestHeader, getRequestIP } from 'h3'
import { createHash, randomUUID } from 'node:crypto'

/**
 * Audit integrity (plan §11.2, benchmark BC-10).
 *
 * `audit_logs` used to answer "something happened" but not "which record" or
 * "who read it". These helpers close that gap without making the call sites
 * carry the plumbing:
 *
 *   - `targetType` / `targetId` — what was acted on (a fine, a student, a read)
 *   - `actorRole` — the role at the time, so a later promotion cannot rewrite it
 *   - `ipHash` — SHA-256 of a salted client address. The raw address never
 *     leaves this function and is never logged.
 *   - `requestId` — one id per HTTP request, shared by every row it writes
 *
 * The log is append-only. There is deliberately no update or delete helper
 * here, and `tests/unit/audit.test.ts` fails if any file under `server/` grows
 * a write path that mutates an audit row.
 */

export interface AuditActor {
  id: string
  role?: string | null
}

export interface AuditRow {
  userId: string | null
  action: string
  details: string | null
  performedBy: string | null
  targetType: string | null
  targetId: string | null
  actorRole: string | null
  ipHash: string | null
  requestId: string | null
}

/** The slice of Prisma these helpers need — works for `prisma` and a transaction client. */
export interface AuditDb {
  auditLog: {
    create(args: { data: AuditRow }): Promise<unknown>
  }
}

export interface AuditWriteInput {
  /** Who performed the action; `null` only for a system job. */
  actor: AuditActor | null
  action: string
  targetType?: string | null
  targetId?: string | null
  /** The user the action concerns (the legacy `userId` column). Defaults to `targetId` for a student target. */
  userId?: string | null
  /** JSON-safe metadata. Never put a raw IP, a document body or a full personal record here. */
  details?: unknown
  requestId?: string | null
  /** Raw client address, hashed before it reaches the database. */
  ip?: string | null
}

export interface AuditReadInput extends Omit<AuditWriteInput, 'action'> {
  action?: string
}

export interface AuditContext {
  requestId: string
  ip: string | null
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const MAX_FIELD_LENGTH = 200

function clean(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  return text.length > 0 ? text.slice(0, MAX_FIELD_LENGTH) : null
}

/**
 * The address as it leaves this module: `x-forwarded-for` can be a list, and
 * Node reports IPv4 over IPv6 as `::ffff:a.b.c.d`.
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  const first = (ip ?? '').split(',')[0]?.trim() ?? ''
  return first.replace(/^::ffff:/i, '') || null
}

/**
 * Salted SHA-256 of a client address, or `null` when either part is missing.
 *
 * An unsalted digest of an IPv4 address is reversible by brute force, so a
 * missing salt degrades to "no hash" rather than to a false sense of
 * pseudonymity. `auditWrite` warns once when that happens.
 */
export function hashIp(ip: string | null | undefined, salt: string | null | undefined): string | null {
  const address = normalizeIp(ip)
  const secret = (salt ?? '').trim()
  if (!address || !secret) return null
  return createHash('sha256').update(`${secret}\n${address}`).digest('hex')
}

let warnedMissingSalt = false

/** `hashIp` with the deployment's `AUDIT_IP_SALT`. */
export function auditIpHash(ip: string | null | undefined): string | null {
  const hash = hashIp(ip, process.env.AUDIT_IP_SALT)
  if (!hash && normalizeIp(ip) && !warnedMissingSalt) {
    warnedMissingSalt = true
    console.warn('[audit] AUDIT_IP_SALT is not set — audit rows will not carry an IP hash (raw addresses are still never stored)')
  }
  return hash
}

/** A caller-supplied request id is accepted only if it looks like one. */
export function requestIdFrom(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  return REQUEST_ID_PATTERN.test(text) ? text : null
}

export function auditDetails(details: unknown): string | null {
  if (details === undefined || details === null) return null
  if (typeof details === 'string') return details
  return JSON.stringify(details)
}

const contexts = new WeakMap<object, AuditContext>()

/**
 * Per-request audit context. A proxy-provided request id is kept (so the log
 * joins the access log); otherwise one UUID is generated and reused by every
 * audit row written while this request is served.
 */
export function auditContext(event: H3Event): AuditContext {
  const cached = contexts.get(event)
  if (cached) return cached

  const header = getRequestHeader(event, 'x-request-id') ?? getRequestHeader(event, 'x-correlation-id')
  const context: AuditContext = {
    requestId: requestIdFrom(header) ?? randomUUID(),
    ip: getRequestIP(event, { xForwardedFor: true }) ?? null
  }
  contexts.set(event, context)
  return context
}

/**
 * Append one row. The data object is built field by field — the raw IP is
 * hashed here and never copied into `details` or a log line.
 */
export async function auditWrite(db: AuditDb, input: AuditWriteInput): Promise<void> {
  const action = clean(input.action)
  if (!action) throw new Error('An audit entry needs an action')

  const targetType = clean(input.targetType)
  const targetId = clean(input.targetId)
  const userId = input.userId !== undefined
    ? clean(input.userId)
    : targetType === 'student' ? targetId : null

  await db.auditLog.create({
    data: {
      userId,
      action,
      details: auditDetails(input.details),
      performedBy: input.actor?.id ?? null,
      targetType,
      targetId,
      actorRole: clean(input.actor?.role),
      ipHash: auditIpHash(input.ip),
      requestId: requestIdFrom(input.requestId)
    }
  })
}

/**
 * A read of a sensitive record. `auditRead` refuses to write a row that cannot
 * name its target; that is the whole point of logging the read. Callers put
 * only metadata in `details` (how many rows matched, which surface was used) —
 * never the content, a name, a student number or a query string.
 */
export async function auditRead(db: AuditDb, input: AuditReadInput): Promise<void> {
  if (!clean(input.targetType) || !clean(input.targetId)) {
    throw new Error('A read audit entry needs a targetType and a targetId')
  }
  await auditWrite(db, {
    ...input,
    action: input.action ?? `read_${clean(input.targetType)}`
  })
}
