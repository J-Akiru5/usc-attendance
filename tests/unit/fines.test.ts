import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINE_RULE,
  classifyAttendance,
  fineDeadline,
  formatPeso,
  planFines,
  resolveRule,
  totalCentavos,
  validateRule
} from '../../server/utils/fines'

const at = (iso: string) => new Date(iso)

describe('resolveRule', () => {
  it('lets the event win, then the category, then the global default', () => {
    expect(resolveRule(null, null, null)).toEqual(DEFAULT_FINE_RULE)

    const global = { absentCentavos: 3000, lateCentavos: 1000, lateAfterMinutes: 15 }
    const category = { absentCentavos: 4000, lateCentavos: 2000, lateAfterMinutes: 20 }
    const event = { absentCentavos: 6000, lateCentavos: 3000, lateAfterMinutes: 45 }

    expect(resolveRule(global, category, null)).toMatchObject({ absentCentavos: 4000, lateAfterMinutes: 20 })
    expect(resolveRule(global, category, event)).toMatchObject({ absentCentavos: 6000, lateAfterMinutes: 45 })
    expect(resolveRule(global, null, null)).toMatchObject({ absentCentavos: 3000, lateAfterMinutes: 15 })
  })
})

describe('classifyAttendance', () => {
  const opensAt = at('2026-11-02T23:30:00Z')

  it('calls a no-show an absence', () => {
    expect(classifyAttendance({ firstSeenAt: null, opensAt, lateAfterMinutes: 30 })).toBe('absent')
  })

  it('is on time until the grace period ends, late after it', () => {
    expect(classifyAttendance({ firstSeenAt: at('2026-11-02T23:40:00Z'), opensAt, lateAfterMinutes: 30 })).toBe('on_time')
    expect(classifyAttendance({ firstSeenAt: at('2026-11-03T00:00:00Z'), opensAt, lateAfterMinutes: 30 })).toBe('on_time')
    expect(classifyAttendance({ firstSeenAt: at('2026-11-03T00:00:01Z'), opensAt, lateAfterMinutes: 30 })).toBe('late')
  })

  it('treats everyone as on time when there is no opening time to be late for', () => {
    expect(classifyAttendance({ firstSeenAt: at('2026-11-03T05:00:00Z'), opensAt: null, lateAfterMinutes: 30 })).toBe('on_time')
  })
})

describe('planFines', () => {
  const rule = { absentCentavos: 5000, lateCentavos: 2500, lateAfterMinutes: 30 }
  const opensAt = at('2026-11-02T23:30:00Z')

  it('charges the audience only, by verdict', () => {
    const firstSeen = new Map([
      ['onTime', at('2026-11-02T23:35:00Z')],
      ['lateOne', at('2026-11-03T00:15:00Z')],
      // 'absentee' never appears
      ['notInAudience', at('2026-11-03T01:00:00Z')]
    ])
    const items = planFines({ audience: ['onTime', 'lateOne', 'absentee'], firstSeen, opensAt, rule })

    expect(items).toEqual([
      { userId: 'lateOne', kind: 'late', amountCentavos: 2500 },
      { userId: 'absentee', kind: 'absent', amountCentavos: 5000 }
    ])
  })

  it('never charges someone twice, even if listed twice', () => {
    const items = planFines({ audience: ['a', 'a'], firstSeen: new Map(), opensAt, rule })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ userId: 'a', kind: 'absent' })
  })

  it('charges nobody when the rates are zero', () => {
    const items = planFines({
      audience: ['a', 'b'],
      firstSeen: new Map(),
      opensAt,
      rule: { absentCentavos: 0, lateCentavos: 0, lateAfterMinutes: 30 }
    })
    expect(items).toEqual([
      { userId: 'a', kind: 'absent', amountCentavos: 0 },
      { userId: 'b', kind: 'absent', amountCentavos: 0 }
    ])
  })
})

describe('totalCentavos', () => {
  it('adds unpaid fines and ignores settled ones by default', () => {
    const fines = [
      { amountCentavos: 5000, status: 'unpaid' },
      { amountCentavos: 2500, status: 'unpaid' },
      { amountCentavos: 5000, status: 'paid' },
      { amountCentavos: 5000, status: 'waived' }
    ]
    expect(totalCentavos(fines)).toBe(7500)
    expect(totalCentavos(fines, false)).toBe(17500)
  })
})

describe('formatPeso', () => {
  it('prints centavos as pesos', () => {
    expect(formatPeso(5000)).toBe('₱50.00')
    expect(formatPeso(2550)).toBe('₱25.50')
    expect(formatPeso(0)).toBe('₱0.00')
    expect(formatPeso(123456)).toBe('₱1,234.56')
  })
})

describe('validateRule', () => {
  it('accepts a sensible rule and keeps what was not sent', () => {
    expect(validateRule({ absentCentavos: 6000 })).toMatchObject({ absentCentavos: 6000, lateCentavos: 2500, lateAfterMinutes: 15 })
  })

  it('refuses nonsense', () => {
    expect(() => validateRule({ absentCentavos: -1 })).toThrow(/absence fine/i)
    expect(() => validateRule({ lateCentavos: 12.5 })).toThrow(/late fine/i)
    expect(() => validateRule({ lateAfterMinutes: 500 })).toThrow(/threshold/i)
    expect(() => validateRule({ absentCentavos: 'lots' })).toThrow(/absence fine/i)
  })
})

describe('fineDeadline', () => {
  it('uses the closing window, or six hours after the start when there is none', () => {
    const date = at('2026-11-02T23:30:00Z')
    expect(fineDeadline({ date, checkInClosesAt: at('2026-11-03T01:00:00Z') }).toISOString()).toBe('2026-11-03T01:00:00.000Z')
    expect(fineDeadline({ date, checkInClosesAt: null }).toISOString()).toBe('2026-11-03T05:30:00.000Z')
  })
})
