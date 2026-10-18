import { describe, expect, it } from 'vitest'
import { DEFAULT_DAILY_LIMIT, emailQuota, recordEmailSend, utcDayStart, type EmailQuotaStore } from '../../server/utils/email-quota'

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
