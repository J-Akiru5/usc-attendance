import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DAILY_LIMIT,
  emailBudgetDecision,
  emailQuota,
  quotaView,
  recordEmailSend,
  tryEmailQuota,
  utcDayStart,
  type EmailQuota,
  type EmailQuotaStore
} from '../../server/utils/email-quota'

function fakeStore(seed: Array<{ kind: string, createdAt: Date }> = []): EmailQuotaStore {
  const rows = [...seed]
  return {
    emailSend: {
      count: async ({ where }) => rows.filter(r => r.createdAt >= where.createdAt.gte).length,
      create: async ({ data }) => {
        rows.push(data)
        return data
      }
    }
  }
}

describe('utcDayStart', () => {
  it('is the UTC midnight of the given instant', () => {
    const start = utcDayStart(new Date('2026-10-18T23:30:00Z'))
    expect(start.toISOString()).toBe('2026-10-18T00:00:00.000Z')
  })

  it('does not roll over before UTC midnight', () => {
    expect(utcDayStart(new Date('2026-10-18T00:00:01Z')).toISOString()).toBe('2026-10-18T00:00:00.000Z')
    expect(utcDayStart(new Date('2026-10-17T23:59:59Z')).toISOString()).toBe('2026-10-17T00:00:00.000Z')
  })
})

describe('emailQuota', () => {
  it('defaults to the free-plan budget with nothing sent', async () => {
    const quota = await emailQuota(fakeStore())
    expect(quota.limit).toBe(DEFAULT_DAILY_LIMIT)
    expect(quota.count).toBe(0)
    expect(quota.remaining).toBe(DEFAULT_DAILY_LIMIT)
    expect(quota.exceeded).toBe(false)
  })

  it('counts only today', async () => {
    const now = new Date('2026-10-18T10:00:00Z')
    const store = fakeStore([
      { kind: 'student_verification', createdAt: new Date('2026-10-18T09:00:00Z') },
      { kind: 'password_reset', createdAt: new Date('2026-10-17T23:59:00Z') }
    ])
    const quota = await emailQuota(store, now)
    expect(quota.count).toBe(1)
    expect(quota.remaining).toBe(DEFAULT_DAILY_LIMIT - 1)
  })

  it('reports exceeded and never negative remaining', async () => {
    const now = new Date('2026-10-18T10:00:00Z')
    const rows = Array.from({ length: DEFAULT_DAILY_LIMIT + 3 }, () => ({ kind: 'password_reset', createdAt: new Date('2026-10-18T01:00:00Z') }))
    const quota = await emailQuota(fakeStore(rows), now)
    expect(quota.exceeded).toBe(true)
    expect(quota.remaining).toBe(0)
  })

  it('honours RESEND_DAILY_LIMIT', async () => {
    const previous = process.env.RESEND_DAILY_LIMIT
    process.env.RESEND_DAILY_LIMIT = '5'
    try {
      expect((await emailQuota(fakeStore())).limit).toBe(5)
      expect((await emailQuota(fakeStore())).remaining).toBe(5)
    } finally {
      if (previous === undefined) delete process.env.RESEND_DAILY_LIMIT
      else process.env.RESEND_DAILY_LIMIT = previous
    }
  })

  it('ignores a nonsense limit and falls back to the default', async () => {
    const previous = process.env.RESEND_DAILY_LIMIT
    process.env.RESEND_DAILY_LIMIT = 'lots'
    try {
      expect((await emailQuota(fakeStore())).limit).toBe(DEFAULT_DAILY_LIMIT)
    } finally {
      if (previous === undefined) delete process.env.RESEND_DAILY_LIMIT
      else process.env.RESEND_DAILY_LIMIT = previous
    }
  })
})

describe('recordEmailSend', () => {
  it('adds a row the quota then counts', async () => {
    const store = fakeStore()
    await recordEmailSend(store, 'student_verification')
    const quota = await emailQuota(store)
    expect(quota.count).toBe(1)
  })
})

function quotaOf(count: number, limit = DEFAULT_DAILY_LIMIT): EmailQuota {
  const remaining = Math.max(0, limit - count)
  return {
    count,
    limit,
    remaining,
    exceeded: remaining <= 0,
    dayStart: '2026-10-18T00:00:00.000Z'
  }
}

describe('emailBudgetDecision (BC-12)', () => {
  it('allows an audience that fits the day, including exactly the remaining budget', () => {
    const roomy = emailBudgetDecision(10, quotaOf(0))
    expect(roomy.state).toBe('fits')
    expect(roomy.allowed).toBe(true)
    expect(roomy.remaining).toBe(DEFAULT_DAILY_LIMIT)
    expect(roomy.message).toBeNull()

    const exact = emailBudgetDecision(40, quotaOf(DEFAULT_DAILY_LIMIT - 40))
    expect(exact.state).toBe('fits')
    expect(exact.allowed).toBe(true)
    expect(exact.message).toBeNull()
  })

  it('refuses an audience larger than the remaining budget, naming both numbers', () => {
    const decision = emailBudgetDecision(900, quotaOf(DEFAULT_DAILY_LIMIT - 12))
    expect(decision.state).toBe('over_budget')
    expect(decision.allowed).toBe(false)
    expect(decision.recipients).toBe(900)
    expect(decision.remaining).toBe(12)
    expect(decision.message).toMatch(/900 people/)
    expect(decision.message).toMatch(/only 12 of today's 90 emails are left/)
    expect(decision.message).toMatch(/in-app only/i)
    expect(decision.message).toMatch(/tomorrow/i)
  })

  it('allows a zero-person audience even when the budget is spent', () => {
    const decision = emailBudgetDecision(0, quotaOf(DEFAULT_DAILY_LIMIT))
    expect(decision.state).toBe('fits')
    expect(decision.allowed).toBe(true)
  })

  it('reports unknown rather than inventing a budget when the counter cannot be read', () => {
    const decision = emailBudgetDecision(25, null)
    expect(decision.state).toBe('unknown')
    expect(decision.allowed).toBe(false)
    expect(decision.recipients).toBe(25)
    expect(decision.remaining).toBeNull()
    expect(decision.limit).toBeNull()
    expect(decision.message).toMatch(/25 people/)
    expect(decision.message).toMatch(/could not be checked/)
    expect(decision.message).not.toMatch(/emails are left/)
  })
})

describe('tryEmailQuota', () => {
  it('returns the quota when the counter can be read', async () => {
    const quota = await tryEmailQuota(fakeStore([{ kind: 'password_reset', createdAt: new Date() }]))
    expect(quota?.count).toBe(1)
  })

  it('returns null (unknown) instead of throwing when the counter fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const broken: EmailQuotaStore = {
        emailSend: {
          count: async () => { throw new Error('database unavailable') },
          create: async () => ({})
        }
      }
      await expect(tryEmailQuota(broken)).resolves.toBeNull()
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('quotaView', () => {
  it('carries the numbers and the day it belongs to when known', () => {
    expect(quotaView(quotaOf(4))).toEqual({
      known: true,
      used: 4,
      limit: DEFAULT_DAILY_LIMIT,
      remaining: DEFAULT_DAILY_LIMIT - 4,
      exceeded: false,
      dayStart: '2026-10-18T00:00:00.000Z'
    })
  })

  it('carries no numbers at all when unknown', () => {
    expect(quotaView(null)).toEqual({
      known: false,
      used: null,
      limit: null,
      remaining: null,
      exceeded: null,
      dayStart: null
    })
  })
})
