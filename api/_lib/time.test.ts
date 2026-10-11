import { describe, expect, it } from 'vitest'

// Force the Vercel runtime default timezone so local runs match production.
process.env.TZ = 'UTC'

const { manilaDayRange, manilaDow, manilaHHMM, manilaYmd } = await import('./time.js')

describe('manilaYmd', () => {
  it('returns the Manila calendar date, not the server date', () => {
    // Monday 07:30 Manila = Sunday 23:30 UTC
    const mon0730Manila = new Date('2026-10-12T07:30:00+08:00')
    expect(manilaYmd(mon0730Manila)).toBe('2026-10-12')
  })

  it('rolls over at Manila midnight, not UTC midnight', () => {
    // Monday 00:30 Manila = Sunday 16:30 UTC
    const mon0030Manila = new Date('2026-10-12T00:30:00+08:00')
    expect(manilaYmd(mon0030Manila)).toBe('2026-10-12')
  })
})

describe('manilaDow', () => {
  it('Monday 07:30 Manila reports as Monday (1), not Sunday (0)', () => {
    // The F5 bug: under TZ=UTC, date.getDay() on this instant returns 0
    const mon0730Manila = new Date('2026-10-12T07:30:00+08:00')
    expect(mon0730Manila.getUTCDay()).toBe(0) // UTC says Sunday — the bug
    expect(manilaDow(mon0730Manila)).toBe(1) // Manila says Monday — the fix
  })

  it('maps all seven days correctly', () => {
    // 2026-10-11 (Sun) .. 2026-10-17 (Sat), noon Manila
    const days = [0, 1, 2, 3, 4, 5, 6]
    days.forEach((dow, i) => {
      const d = new Date(`2026-10-${11 + i}T12:00:00+08:00`)
      expect(manilaDow(d)).toBe(dow)
    })
  })
})

describe('manilaDayRange', () => {
  it('covers 00:00 to 24:00 Manila = 16:00Z to 16:00Z', () => {
    const mon0730Manila = new Date('2026-10-12T07:30:00+08:00')
    const { gte, lt } = manilaDayRange(mon0730Manila)
    expect(gte.toISOString()).toBe('2026-10-11T16:00:00.000Z')
    expect(lt.toISOString()).toBe('2026-10-12T16:00:00.000Z')
  })

  it('contains the instant it was derived from', () => {
    const d = new Date('2026-10-12T07:30:00+08:00')
    const { gte, lt } = manilaDayRange(d)
    expect(d.getTime()).toBeGreaterThanOrEqual(gte.getTime())
    expect(d.getTime()).toBeLessThan(lt.getTime())
  })

  it('excludes the previous Manila evening (still the previous day)', () => {
    // Monday 00:30 Manila — a Sunday-duty record must not match Monday's range
    const mon0030 = new Date('2026-10-12T00:30:00+08:00')
    const sunRange = manilaDayRange(new Date('2026-10-11T09:00:00+08:00'))
    expect(mon0030.getTime()).toBeGreaterThanOrEqual(sunRange.lt.getTime())
  })
})

describe('manilaHHMM', () => {
  it('formats Manila wall-clock time', () => {
    const mon0730Manila = new Date('2026-10-12T07:30:00+08:00')
    expect(manilaHHMM(mon0730Manila)).toBe('07:30')
  })

  it('differs from UTC for the same instant', () => {
    const mon0730Manila = new Date('2026-10-12T07:30:00+08:00')
    expect(manilaHHMM(mon0730Manila)).not.toBe('23:30')
  })
})
