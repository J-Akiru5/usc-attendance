import { badRequest } from './http'

/**
 * Offline scanner queue (plan §8.2). A scan taken with no signal is queued with
 * the moment it happened and synced later; the server then judges it *as of
 * that moment* — token lifetime, grants and the check-in window included — so a
 * genuine scan is not lost, while anything out of bounds is refused.
 */

/** How stale a queued scan may be when it finally syncs. */
export const MAX_SYNC_AGE_MS = 48 * 60 * 60 * 1000

/** Clock-skew allowance for a phone whose time runs a little fast. */
export const FUTURE_GRACE_MS = 5 * 60 * 1000

/**
 * A queued scan may claim a moment a little before its token was issued (the
 * phone's clock is not exact); claiming minutes earlier means the token did not
 * exist when the scan supposedly happened.
 */
export const TOKEN_CLOCK_SKEW_SECONDS = 15

/**
 * The moment a scan happened: `scannedAt` when the client queued it offline,
 * otherwise now. Rejects nonsense rather than silently recording the wrong time.
 */
export function resolveScanTime(value: unknown, now: Date = new Date()): Date {
  if (value === undefined || value === null || value === '') return now
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    throw badRequest('scannedAt must be an ISO timestamp')
  }

  const when = new Date(value)
  if (Number.isNaN(when.getTime())) throw badRequest('scannedAt is not a valid date and time')
  if (when.getTime() > now.getTime() + FUTURE_GRACE_MS) throw badRequest('scannedAt cannot be in the future')
  if (now.getTime() - when.getTime() > MAX_SYNC_AGE_MS) {
    throw badRequest('That scan is more than 48 hours old and can no longer be recorded — record it from the roster instead')
  }

  return when
}

/**
 * Whether the client actually sent a scan moment. A queued scan always does, and
 * the record must then carry that moment rather than the sync time — an officer
 * syncing five seconds later must not shift the roll call, and an auditor wants
 * both moments on anything that came in out of band.
 */
export function hasExplicitScanTime(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}
