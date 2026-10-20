import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCAN_LIMIT,
  DEFAULT_SCAN_WINDOW_MINUTES,
  consumeScanBudget,
  decideScanBudget,
  scanRateLimitConfig,
  scanWindowStart,
  type ScanRateLimitStore
} from '../../server/utils/rate-limit'

const HOUR = 60 * 60_000
const CONFIG = { limit: 3, windowMs: HOUR }
const NOW = new Date('2026-10-20T12:34:56.000Z')

interface StoredCounter {
  count: number
  throttled: boolean
}

/** The real store is PostgreSQL; this one keeps the decisions unit-testable. */
function memoryStore(): ScanRateLimitStore & { rows: Map<string, StoredCounter> } {
  const rows = new Map<string, StoredCounter>()
  const key = (officerId: string, windowStart: Date) => `${officerId}:${windowStart.toISOString()}`

  return {
    rows,
    async increment(officerId, windowStart) {
      const id = key(officerId, windowStart)
      const row = rows.get(id) ?? { count: 0, throttled: false }
      row.count += 1
      rows.set(id, row)
      return row.count
    },
    async markThrottled(officerId, windowStart) {
      const row = rows.get(key(officerId, windowStart))
      if (!row || row.throttled) return false
      row.throttled = true
      return true
    }
  }
}

describe('scanRateLimitConfig', () => {
  it('defaults to a budget that covers a full event and a queue flush', () => {
    expect(DEFAULT_SCAN_LIMIT).toBe(3_000)
    expect(DEFAULT_SCAN_WINDOW_MINUTES).toBe(60)
    expect(scanRateLimitConfig({})).toEqual({ limit: DEFAULT_SCAN_LIMIT, windowMs: HOUR })
  })

  it('lets an unusually large door be tuned from the environment', () => {
    expect(scanRateLimitConfig({ SCAN_RATE_LIMIT: '4500', SCAN_RATE_WINDOW_MINUTES: '15' }))
      .toEqual({ limit: 4_500, windowMs: 15 * 60_000 })
  })

  it('falls back to the default instead of disabling the limit on nonsense', () => {
    expect(scanRateLimitConfig({ SCAN_RATE_LIMIT: '0', SCAN_RATE_WINDOW_MINUTES: '-5' }))
      .toEqual({ limit: DEFAULT_SCAN_LIMIT, windowMs: HOUR })
    expect(scanRateLimitConfig({ SCAN_RATE_LIMIT: 'many', SCAN_RATE_WINDOW_MINUTES: '' }))
      .toEqual({ limit: DEFAULT_SCAN_LIMIT, windowMs: HOUR })
  })

  it('survives a nonsense window size at the decision layer', () => {
    expect(scanWindowStart(NOW, Number.NaN).getTime()).toBe(Date.parse('2026-10-20T12:00:00.000Z'))
  })
})

describe('scanWindowStart', () => {
  it('aligns every instance to the same epoch boundary', () => {
    expect(scanWindowStart(NOW, HOUR).toISOString()).toBe('2026-10-20T12:00:00.000Z')
    expect(scanWindowStart(new Date('2026-10-20T12:00:00.000Z'), HOUR).toISOString()).toBe('2026-10-20T12:00:00.000Z')
    expect(scanWindowStart(new Date('2026-10-20T12:59:59.999Z'), HOUR).toISOString()).toBe('2026-10-20T12:00:00.000Z')
  })

  it('supports a shorter window', () => {
    const tenMinutes = 10 * 60_000
    expect(scanWindowStart(NOW, tenMinutes).toISOString()).toBe('2026-10-20T12:30:00.000Z')
  })
})

describe('decideScanBudget', () => {
  const windowStart = scanWindowStart(NOW, CONFIG.windowMs)

  it('allows every attempt up to and including the limit', () => {
    expect(decideScanBudget({ count: 1, limit: 3, windowStart, now: NOW, windowMs: CONFIG.windowMs }).allowed).toBe(true)
    expect(decideScanBudget({ count: 3, limit: 3, windowStart, now: NOW, windowMs: CONFIG.windowMs }).allowed).toBe(true)
    expect(decideScanBudget({ count: 3, limit: 3, windowStart, now: NOW, windowMs: CONFIG.windowMs }).remaining).toBe(0)
  })

  it('refuses the attempt after the limit', () => {
    const decision = decideScanBudget({ count: 4, limit: 3, windowStart, now: NOW, windowMs: CONFIG.windowMs })
    expect(decision.allowed).toBe(false)
    expect(decision.remaining).toBe(0)
    expect(decision.count).toBe(4)
  })

  it('says how long the caller must wait, and never answers zero', () => {
    const decision = decideScanBudget({ count: 9, limit: 3, windowStart, now: NOW, windowMs: CONFIG.windowMs })
    expect(decision.retryAfterSeconds).toBe(Math.ceil((Date.parse('2026-10-20T13:00:00.000Z') - NOW.getTime()) / 1000))
    const atBoundary = decideScanBudget({ count: 9, limit: 3, windowStart, now: new Date('2026-10-20T12:59:59.999Z'), windowMs: CONFIG.windowMs })
    expect(atBoundary.retryAfterSeconds).toBe(1)
  })

  it('normalises nonsense counters', () => {
    const decision = decideScanBudget({ count: Number.NaN, limit: 3, windowStart, now: NOW, windowMs: CONFIG.windowMs })
    expect(decision.count).toBe(0)
    expect(decision.allowed).toBe(true)
  })
})

describe('consumeScanBudget', () => {
  it('counts attempts, allows the budget and then denies', async () => {
    const store = memoryStore()
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await consumeScanBudget(store, 'officer-a', NOW, CONFIG)
      expect(result.allowed).toBe(true)
      expect(result.count).toBe(attempt)
      expect(result.audit).toBe(false)
    }

    const denied = await consumeScanBudget(store, 'officer-a', NOW, CONFIG)
    expect(denied.allowed).toBe(false)
    expect(denied.count).toBe(4)
    expect(denied.audit).toBe(true)
  })

  it('audits only the first denial in a window', async () => {
    const store = memoryStore()
    for (let attempt = 0; attempt < 4; attempt += 1) await consumeScanBudget(store, 'officer-a', NOW, CONFIG)

    const second = await consumeScanBudget(store, 'officer-a', NOW, CONFIG)
    expect(second.allowed).toBe(false)
    expect(second.audit).toBe(false)
    const third = await consumeScanBudget(store, 'officer-a', NOW, CONFIG)
    expect(third.audit).toBe(false)
  })

  it('keeps one officer from spending another officer budget', async () => {
    const store = memoryStore()
    for (let attempt = 0; attempt < 3; attempt += 1) await consumeScanBudget(store, 'officer-a', NOW, CONFIG)

    const other = await consumeScanBudget(store, 'officer-b', NOW, CONFIG)
    expect(other.allowed).toBe(true)
    expect(other.count).toBe(1)
  })

  it('resets when the window rolls over, and audits the new window separately', async () => {
    const store = memoryStore()
    for (let attempt = 0; attempt < 4; attempt += 1) await consumeScanBudget(store, 'officer-a', NOW, CONFIG)

    const nextWindow = new Date(NOW.getTime() + HOUR)
    const fresh = await consumeScanBudget(store, 'officer-a', nextWindow, CONFIG)
    expect(fresh.allowed).toBe(true)
    expect(fresh.count).toBe(1)
    expect(fresh.audit).toBe(false)
  })

  it('lets a 500-scan queue flush through the default budget', async () => {
    const store = memoryStore()
    let last: Awaited<ReturnType<typeof consumeScanBudget>> | undefined
    for (let attempt = 0; attempt < 500; attempt += 1) {
      last = await consumeScanBudget(store, 'officer-a', NOW, scanRateLimitConfig({}))
      expect(last.allowed).toBe(true)
    }
    expect(last?.count).toBe(500)
  })
})
