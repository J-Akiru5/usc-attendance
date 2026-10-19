import { describe, expect, it } from 'vitest'
import { buildAuditHealth, type AuditEventLike } from '../../server/utils/audit-health'

// A fixed instant: 20 October 2026, 10:00 in Manila (02:00 UTC).
const NOW = new Date('2026-10-20T10:00:00+08:00')
const DAY_MS = 86_400_000

/** A moment on a Manila calendar day, relative to NOW's day. */
function manila(dayOffset: number, hour = 9, minute = 0): Date {
  const base = new Date('2026-10-20T00:00:00+08:00').getTime()
  return new Date(base + dayOffset * DAY_MS + hour * 3_600_000 + minute * 60_000)
}

function row(action: string, createdAt: Date): AuditEventLike {
  return { action, createdAt }
}

describe('buildAuditHealth', () => {
  it('counts actions in the rolling 24 h and 7 d windows, ignoring older and future rows', () => {
    const health = buildAuditHealth([
      row('payment_recorded', manila(0, 9)),
      row('payment_recorded', manila(0, 9, 30)),
      row('document_filed', manila(-3, 11)),
      row('account_created', manila(-10, 11)),
      row('clock_skew', manila(1, 11))
    ], NOW)

    expect(health.counts24h).toEqual([{ action: 'payment_recorded', count: 2 }])
    expect(health.counts7d).toEqual([
      { action: 'payment_recorded', count: 2 },
      { action: 'document_filed', count: 1 }
    ])
    expect(health.totals).toEqual({ last24h: 2, last7d: 3, actions: 2 })
    expect(health.today).toBe('2026-10-20')
    expect(health.truncated).toBe(false)
  })

  it('flags an action that ran on each of the previous three days but not today', () => {
    const health = buildAuditHealth([
      row('fines_generated', manila(-1, 23, 30)),
      row('fines_generated', manila(-2, 0, 30)),
      row('fines_generated', manila(-3, 12)),

      // Only two previous days — not a clear enough pattern.
      row('student_record_viewed', manila(-1, 12)),
      row('student_record_viewed', manila(-2, 12)),

      // Ran again today, so it is not silent.
      row('announcement_created', manila(-1, 12)),
      row('announcement_created', manila(-2, 12)),
      row('announcement_created', manila(-3, 12)),
      row('announcement_created', manila(0, 8))
    ], NOW)

    expect(health.silentGaps).toHaveLength(1)
    expect(health.silentGaps[0]).toMatchObject({
      action: 'fines_generated',
      today: 0,
      previousDays: [
        { day: '2026-10-17', count: 1 },
        { day: '2026-10-18', count: 1 },
        { day: '2026-10-19', count: 1 }
      ]
    })
    expect(health.silentGaps[0]!.lastSeenAt).toBe(manila(-1, 23, 30).toISOString())
  })

  it('uses the Manila calendar day, not UTC', () => {
    // 00:30 Manila on the 20th is still 16:30 UTC on the 19th. It counts as
    // today, so the three-day pattern is broken and no gap is reported.
    const health = buildAuditHealth([
      row('fines_generated', manila(0, 0, 30)),
      row('fines_generated', manila(-1, 12)),
      row('fines_generated', manila(-2, 12)),
      row('fines_generated', manila(-3, 12))
    ], NOW)

    expect(health.silentGaps).toEqual([])
    expect(health.counts24h).toEqual([{ action: 'fines_generated', count: 2 }])
  })

  it('says when the row cap was hit instead of quietly reporting a partial week', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row('read_student', manila(0, 8, i)))
    const health = buildAuditHealth(rows, NOW, 3)
    expect(health.truncated).toBe(true)
    expect(health.totals.last7d).toBe(3)
  })

  it('handles a quiet week', () => {
    const health = buildAuditHealth([], NOW)
    expect(health.counts24h).toEqual([])
    expect(health.counts7d).toEqual([])
    expect(health.silentGaps).toEqual([])
    expect(health.totals).toEqual({ last24h: 0, last7d: 0, actions: 0 })
    expect(health.windows.last24h.until).toBe(NOW.toISOString())
  })
})
