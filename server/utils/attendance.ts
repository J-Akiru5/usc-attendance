import { FUTURE_GRACE_MS } from './offline'

/**
 * Scan integrity (benchmark BC-5, plan §8.2).
 *
 * A check-in can arrive twice: the officer's phone retries a queued scan, the
 * network drops a response the server already committed, or an impatient tap
 * sends the same scan again. The decisions that make those cases safe are pure
 * functions here so the API routes and the unit tests cannot disagree:
 *
 *   - `idempotencyKeyProblem` — is the presented key a key at all?
 *   - `idempotencyOutcome`  — create, return the first record, or refuse
 *   - `decideDeviceTime`    — how the device clock relates to the server clock
 *   - `manualReasonProblem` — the reason a manual check-in must carry
 *
 * Nothing here touches Prisma or HTTP, so an edge case costs a millisecond to
 * prove.
 */

/* ---------------------------------------------------------- idempotency key */

/** A key shorter than this is a typo, not a scan identity. */
export const MIN_IDEMPOTENCY_KEY_LENGTH = 8
/** Bounded so a client cannot use the column as storage. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128
/** Opaque, URL-safe: a UUID and `crypto.randomUUID()` both fit. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Why a presented key cannot be used, or `null` when it is fine (or absent —
 * the key is optional and live scans need none). The client trims before it
 * sends; whitespace inside a key is a bug on its side, not a variant to accept.
 */
export function idempotencyKeyProblem(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return 'idempotencyKey must be a string'
  const key = value.trim()
  if (key.length < MIN_IDEMPOTENCY_KEY_LENGTH) {
    return `idempotencyKey must be at least ${MIN_IDEMPOTENCY_KEY_LENGTH} characters`
  }
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return `idempotencyKey must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return 'idempotencyKey may contain only letters, digits, hyphens and underscores'
  }
  return null
}

/** The key as it should be stored, or `null` when the client sent none. */
export function normalizeIdempotencyKey(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  return typeof value === 'string' ? value.trim() : null
}

/* --------------------------------------------------------------- replaying */

/** What a stored attendance row claims about the scan it recorded. */
export interface AttendanceIdentity {
  recordedBy: string
  type: string
  eventId: string | null
  userId: string
}

/** What the retried request says it is asking to record. */
export interface AttendanceRequestIdentity {
  officerId: string
  type: string
  eventId: string | null
  userId: string
}

/**
 * - `create`   — the key has not been used; record the scan.
 * - `replay`   — the same officer retries the same scan; return the first row
 *                and write nothing.
 * - `conflict` — the key already belongs to another officer or another scan.
 *                The route refuses without naming the first record, so the key
 *                cannot be used to read back somebody else's check-in.
 */
export type IdempotencyOutcome = 'create' | 'replay' | 'conflict'

/**
 * Decides what a presented key means. Officer equality is checked first and a
 * mismatch is always a conflict: a key is a scan identity, not a lookup handle.
 * The target is compared too, so an officer who accidentally reuses a key for a
 * different student is refused instead of silently getting the first student's
 * record back.
 */
export function idempotencyOutcome(
  existing: AttendanceIdentity | null | undefined,
  request: AttendanceRequestIdentity
): IdempotencyOutcome {
  if (!existing) return 'create'
  if (existing.recordedBy !== request.officerId) return 'conflict'
  if (existing.type !== request.type) return 'conflict'
  if ((existing.eventId ?? null) !== (request.eventId ?? null)) return 'conflict'
  if (existing.userId !== request.userId) return 'conflict'
  return 'replay'
}

/* ------------------------------------------------------------- device time */

export type DeviceTimeVerdict = 'absent' | 'on-time' | 'behind' | 'ahead'

export interface ScanTimeDecision {
  verdict: DeviceTimeVerdict
  /** What the device claimed, kept as evidence. `null` when it sent nothing. */
  scannedAt: Date | null
  /** The moment the row is stamped with. Never a device's future. */
  effectiveAt: Date
  /** How far ahead of the server the device claimed to be (`0` otherwise). */
  aheadMs: number
  /** False only when the claim is too far ahead to mean anything. */
  accepted: boolean
  /** True when the device time is the row's moment (absent is `false`). */
  usedDeviceTime: boolean
  /** True when the device was ahead and the row uses the server moment instead. */
  clamped: boolean
}

/**
 * The server clock is the authority; the device clock is evidence.
 *
 * A queued scan legitimately carries a moment in the past (up to 48 hours — the
 * route checks that separately), and that moment is what the check-in window
 * and fines should see. A phone whose clock runs a little fast is different:
 * the claim is stored in `scannedAt`, but the row is stamped with server time,
 * so a device cannot walk a check-in into the future. Beyond the grace window
 * the claim is refused outright.
 */
export function decideDeviceTime(
  deviceAt: Date | null | undefined,
  serverNow: Date,
  graceMs = FUTURE_GRACE_MS
): ScanTimeDecision {
  if (!deviceAt) {
    return {
      verdict: 'absent',
      scannedAt: null,
      effectiveAt: serverNow,
      aheadMs: 0,
      accepted: true,
      usedDeviceTime: false,
      clamped: false
    }
  }

  const deltaMs = deviceAt.getTime() - serverNow.getTime()
  const aheadMs = Math.max(0, deltaMs)

  if (aheadMs > 0) {
    return {
      verdict: 'ahead',
      scannedAt: deviceAt,
      effectiveAt: serverNow,
      aheadMs,
      accepted: aheadMs <= graceMs,
      usedDeviceTime: false,
      clamped: true
    }
  }

  return {
    verdict: deltaMs === 0 ? 'on-time' : 'behind',
    scannedAt: deviceAt,
    effectiveAt: deviceAt,
    aheadMs: 0,
    accepted: true,
    usedDeviceTime: true,
    clamped: false
  }
}

/* ------------------------------------------------------------ manual entry */

/** Long enough to say "phone dead, ID shown", short enough to require one. */
export const MANUAL_REASON_MIN_LENGTH = 3
export const MANUAL_REASON_MAX_LENGTH = 200

/**
 * Why a manual check-in cannot be recorded, or `null` when it can. A manual
 * entry is the fallback when the QR or the ID will not read, so "why" is the
 * only thing that separates it from an arbitrary click on a roster.
 */
export function manualReasonProblem(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return 'A manual check-in needs a short reason (for example: phone dead, ID would not scan).'
  }
  if (typeof value !== 'string') return 'manualReason must be text'
  const reason = value.trim()
  if (reason.length < MANUAL_REASON_MIN_LENGTH) {
    return 'That reason is too short — say what happened.'
  }
  if (reason.length > MANUAL_REASON_MAX_LENGTH) {
    return `That reason is too long — keep it under ${MANUAL_REASON_MAX_LENGTH} characters.`
  }
  return null
}

/** The reason as it is stored, or `null` when none was supplied. */
export function normalizeManualReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const reason = value.trim()
  return reason.length > 0 ? reason : null
}
