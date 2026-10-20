import { setResponseHeader, type H3Event } from 'h3'
import type { PrismaClient } from '@prisma/client'
import { HttpError } from './http'
import { auditContext, auditWrite, type AuditActor, type AuditDb } from './audit'

/**
 * Per-officer scan budget (plan §8.2, T-0008).
 *
 * Why this is a database table rather than a counter in memory: the API runs as
 * Vercel serverless functions, and separate instances do not share memory. An
 * in-memory limiter would give every warm instance its own budget, so a caller
 * spraying requests across instances would simply multiply the allowance. The
 * `scan_rate_limits` row is the one counter every instance increments, which is
 * what makes the limit true rather than decorative.
 *
 * Shape of the budget: a fixed window per officer. Each request atomically
 * increments (officer, window) and is allowed while the count is at most the
 * limit. The default (3,000 scans an hour) is deliberately far above what a
 * genuine door can produce - the scanner itself allows one scan per two seconds
 * (30 a minute) and the offline queue is capped at 500 - so reconnecting after
 * an offline period and flushing the queue cannot lock an officer out. A fixed
 * window can be burst at a boundary (at most two budgets in a short span); that
 * is acceptable for abuse protection and is stated here rather than hidden.
 *
 * A throttled request is audited once per officer per window (`throttledAt`
 * records the first denial), so an abusive caller cannot flood the audit log.
 */

/** 3,000 scans an hour: a full event, with room for a 500-scan queue flush. */
export const DEFAULT_SCAN_LIMIT = 3_000
/** One hour. */
export const DEFAULT_SCAN_WINDOW_MINUTES = 60

export interface ScanRateLimitConfig {
  /** Requests allowed per officer per window. */
  limit: number
  windowMs: number
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? '', 10)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * Reads the budget from the environment so an event with an unusually large
 * door can be tuned without a deploy. Nonsense values fall back to the default
 * rather than disabling the limit.
 */
export function scanRateLimitConfig(env: Record<string, string | undefined> = process.env): ScanRateLimitConfig {
  const limit = positiveInteger(env.SCAN_RATE_LIMIT, DEFAULT_SCAN_LIMIT)
  const minutes = positiveInteger(env.SCAN_RATE_WINDOW_MINUTES, DEFAULT_SCAN_WINDOW_MINUTES)
  return { limit, windowMs: minutes * 60_000 }
}

/**
 * The fixed window a moment belongs to, aligned to the Unix epoch so every
 * serverless instance computes the same boundary for the same request.
 */
export function scanWindowStart(now: Date, windowMs: number): Date {
  const size = Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : DEFAULT_SCAN_WINDOW_MINUTES * 60_000
  return new Date(Math.floor(now.getTime() / size) * size)
}

export interface ScanBudgetDecision {
  allowed: boolean
  /** Attempts counted in this window, including this one. */
  count: number
  limit: number
  remaining: number
  windowStart: Date
  /** Seconds until the window rolls over; at least 1. */
  retryAfterSeconds: number
}

export function decideScanBudget(input: {
  count: number
  limit: number
  windowStart: Date
  now: Date
  windowMs: number
}): ScanBudgetDecision {
  const count = Number.isFinite(input.count) ? Math.max(0, Math.floor(input.count)) : 0
  const limit = Number.isFinite(input.limit) ? Math.max(0, Math.floor(input.limit)) : 0
  const windowEndsAt = input.windowStart.getTime() + input.windowMs
  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    windowStart: input.windowStart,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - input.now.getTime()) / 1000))
  }
}

/** The two writes the limiter needs; a fake keeps the unit tests database-free. */
export interface ScanRateLimitStore {
  /** Atomically add one attempt and return the window's new count. */
  increment(officerId: string, windowStart: Date, now: Date): Promise<number>
  /** Claim the one audit slot for this window; true only for the first denial. */
  markThrottled(officerId: string, windowStart: Date, now: Date): Promise<boolean>
}

export interface ScanBudgetResult extends ScanBudgetDecision {
  /** True when this denial is the first in the window and must be audited. */
  audit: boolean
}

/**
 * Counts the attempt and decides. Counting denied attempts too keeps the window
 * from being extended by repeated denials; it only means `count` can exceed the
 * limit while the pause holds.
 */
export async function consumeScanBudget(
  store: ScanRateLimitStore,
  officerId: string,
  now: Date = new Date(),
  config: ScanRateLimitConfig = scanRateLimitConfig()
): Promise<ScanBudgetResult> {
  const windowStart = scanWindowStart(now, config.windowMs)
  const count = await store.increment(officerId, windowStart, now)
  const decision = decideScanBudget({ count, limit: config.limit, windowStart, now, windowMs: config.windowMs })
  if (decision.allowed) return { ...decision, audit: false }

  const audit = await store.markThrottled(officerId, windowStart, now)
  return { ...decision, audit }
}

/** The slice of Prisma the limiter touches. Type-only import: no client at runtime. */
export type ScanRateLimitDb = Pick<PrismaClient, 'scanRateLimit'>

/**
 * Prisma emits `INSERT ... ON CONFLICT ... DO UPDATE` for this upsert (one
 * unique target, no nested writes), so the increment is atomic in PostgreSQL —
 * two instances racing the same officer serialise on the row lock. `count` is
 * never read and written back in application code.
 */
export function scanRateLimitStore(db: ScanRateLimitDb): ScanRateLimitStore {
  return {
    async increment(officerId, windowStart, now) {
      const row = await db.scanRateLimit.upsert({
        where: { officerId_windowStart: { officerId, windowStart } },
        create: { officerId, windowStart, count: 1, updatedAt: now },
        update: { count: { increment: 1 }, updatedAt: now },
        select: { count: true }
      })
      return row.count
    },
    async markThrottled(officerId, windowStart, now) {
      const result = await db.scanRateLimit.updateMany({
        where: { officerId, windowStart, throttledAt: null },
        data: { throttledAt: now }
      })
      return result.count > 0
    }
  }
}

/**
 * Route guard: counts the attempt, and on the first denial of the window writes
 * one audit row and answers 429 with `Retry-After`. Called immediately after
 * authentication, before the body is trusted, so an abusive client is stopped
 * before it can make the server do work.
 */
export async function assertScanBudget(
  event: H3Event,
  actor: AuditActor,
  db: ScanRateLimitDb & AuditDb,
  now: Date = new Date()
): Promise<void> {
  const result = await consumeScanBudget(scanRateLimitStore(db), actor.id, now)
  if (result.allowed) return

  if (result.audit) {
    await auditWrite(db, {
      actor,
      action: 'attendance_scan_throttled',
      targetType: 'user',
      targetId: actor.id,
      details: {
        scope: 'attendance_scan',
        windowStart: result.windowStart.toISOString(),
        count: result.count,
        limit: result.limit
      },
      ...auditContext(event)
    })
  }

  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60))
  setResponseHeader(event, 'Retry-After', result.retryAfterSeconds)
  throw new HttpError(
    429,
    `Scanning is paused for this account: its scan budget is spent. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}. Queued scans stay on this phone and will sync afterwards.`
  )
}
