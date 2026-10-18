import { describe, expect, it } from 'vitest'
import {
  MANILA_OFFSET_HOURS,
  attendedIds,
  expectedForEvent,
  groupRates,
  methodMix,
  noShows,
  peakHour,
  rankStudents,
  rate,
  signatureRate,
  timingHistogram
} from '../../server/utils/analytics'

const at = (iso: string) => ({ userId: 'u', method: 'qr', createdAt: new Date(iso) })

describe('rate', () => {
  it('is a share that never divides by zero', () => {
    expect(rate(5, 10)).toBe(0.5)
    expect(rate(0, 0)).toBe(0)
    expect(rate(3, 0)).toBe(0)
    expect(rate(11, 10)).toBe(1)
  })
})

describe('attendedIds / noShows', () => {
  it('counts a person once even after a checkout and a second check-in', () => {
    const rows = [
      { userId: 'a', method: 'qr', createdAt: new Date() },
      { userId: 'a', method: 'qr', createdAt: new Date() },
      { userId: 'b', method: 'manual', createdAt: new Date() }
    ]
    expect([...attendedIds(rows)].sort()).toEqual(['a', 'b'])
  })

  it('lists who never appeared, once, in order', () => {
    const attended = new Set(['b'])
    expect(noShows(['a', 'b', 'c', 'a'], attended)).toEqual(['a', 'c'])
  })
})

describe('timingHistogram', () => {
  it('buckets check-ins by Manila hour', () => {
    // 01:30 UTC is 09:30 in Manila; 16:00 UTC is midnight.
    const buckets = timingHistogram([
      at('2026-10-18T01:30:00Z'),
      at('2026-10-18T01:45:00Z'),
      at('2026-10-18T16:00:00Z')
    ])
    expect(buckets).toHaveLength(24)
    expect(buckets[9]!.count).toBe(2)
    expect(buckets[0]!.count).toBe(1)
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(3)
    expect(MANILA_OFFSET_HOURS).toBe(8)
  })

  it('names the busiest hour and copes with an empty day', () => {
    expect(peakHour(timingHistogram([at('2026-10-18T02:00:00Z')]))).toBe(10)
    expect(peakHour(timingHistogram([]))).toBeNull()
    // Ties go to the earlier hour.
    expect(peakHour([{ hour: 8, count: 2 }, { hour: 9, count: 2 }])).toBe(8)
  })
})

describe('groupRates', () => {
  const members = [
    { userId: 'a', collegeId: 'c1', yearLevel: 1 },
    { userId: 'b', collegeId: 'c1', yearLevel: 2 },
    { userId: 'c', collegeId: 'c2', yearLevel: 2 },
    { userId: 'd', collegeId: null, yearLevel: null }
  ]

  it('groups by college and computes each rate', () => {
    const rows = groupRates(members, new Set(['a', 'c']), 'collegeId')
    expect(rows).toEqual([
      { key: 'c1', expected: 2, attended: 1, rate: 0.5 },
      { key: 'c2', expected: 1, attended: 1, rate: 1 },
      { key: 'unplaced', expected: 1, attended: 0, rate: 0 }
    ])
  })

  it('groups by year level', () => {
    const rows = groupRates(members, new Set(['b', 'c']), 'yearLevel')
    expect(rows.find(r => r.key === '2')).toMatchObject({ expected: 2, attended: 2, rate: 1 })
    expect(rows.find(r => r.key === '1')).toMatchObject({ expected: 1, attended: 0 })
    expect(rows.find(r => r.key === 'unplaced')).toMatchObject({ expected: 1, attended: 0 })
  })
})

describe('rankStudents', () => {
  const counts = new Map([['a', 3], ['b', 5], ['c', 1], ['d', 5]])

  it('orders the top and the bottom deterministically', () => {
    expect(rankStudents(counts, 'top', 3)).toEqual([
      { userId: 'b', count: 5 },
      { userId: 'd', count: 5 },
      { userId: 'a', count: 3 }
    ])
    expect(rankStudents(counts, 'bottom', 2)).toEqual([
      { userId: 'c', count: 1 },
      { userId: 'a', count: 3 }
    ])
  })

  it('returns everyone when no limit is asked for', () => {
    expect(rankStudents(counts, 'top', 0)).toHaveLength(4)
  })
})

describe('methodMix / signatureRate', () => {
  it('counts how people were recorded', () => {
    const rows = [
      { userId: 'a', method: 'qr', createdAt: new Date() },
      { userId: 'b', method: 'qr', createdAt: new Date() },
      { userId: 'c', method: 'barcode', createdAt: new Date() },
      { userId: 'd', method: 'manual', createdAt: new Date() }
    ]
    expect(methodMix(rows)).toEqual([
      { method: 'qr', count: 2 },
      { method: 'barcode', count: 1 },
      { method: 'manual', count: 1 }
    ])
  })

  it('measures signatures against the people who turned up', () => {
    const rows = [
      { userId: 'a', method: 'qr', createdAt: new Date(), hasSignature: true },
      { userId: 'b', method: 'qr', createdAt: new Date(), hasSignature: false },
      { userId: 'b', method: 'qr', createdAt: new Date(), hasSignature: false }
    ]
    expect(signatureRate(rows)).toBe(0.5)
    expect(signatureRate([])).toBe(0)
  })
})

describe('expectedForEvent', () => {
  it('uses registrants when an event takes registrations', () => {
    expect(expectedForEvent({ registrationRequired: true, registrants: 40, activeStudents: 900 })).toBe(40)
    expect(expectedForEvent({ registrationRequired: false, registrants: 12, activeStudents: 900 })).toBe(900)
  })
})
