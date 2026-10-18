import { describe, expect, it } from 'vitest'
import { planFlush, type QueuedScan } from '../../app/utils/scan-queue'
import { FUTURE_GRACE_MS, MAX_SYNC_AGE_MS, hasExplicitScanTime, resolveScanTime } from '../../server/utils/offline'

const scan = (id: string, scannedAt = '2026-10-18T01:00:00.000Z'): QueuedScan => ({
  id,
  kind: 'barcode',
  eventId: 'e1',
  label: `Student ${id}`,
  lat: 10.72,
  lng: 122.56,
  accuracy: 8,
  scannedAt
})

describe('planFlush', () => {
  it('separates what was sent, what is refused and what never got a chance', () => {
    const plan = planFlush([scan('a'), scan('b'), scan('c')], [
      { id: 'a', outcome: 'synced' },
      { id: 'b', outcome: 'refused', reason: 'Already checked in.' }
    ])
    expect(plan.synced.map(s => s.id)).toEqual(['a'])
    expect(plan.refused).toEqual([{ scan: scan('b'), reason: 'Already checked in.' }])
    expect(plan.retry.map(s => s.id)).toEqual(['c'])
  })

  it('keeps everything when nothing was attempted', () => {
    const plan = planFlush([scan('a'), scan('b')], [])
    expect(plan.retry.map(s => s.id)).toEqual(['a', 'b'])
    expect(plan.synced).toEqual([])
    expect(plan.refused).toEqual([])
  })
})

describe('resolveScanTime', () => {
  const now = new Date('2026-10-18T12:00:00.000Z')

  it('falls back to now when the client did not queue it offline', () => {
    expect(resolveScanTime(undefined, now).toISOString()).toBe(now.toISOString())
    expect(resolveScanTime(null, now).toISOString()).toBe(now.toISOString())
    expect(resolveScanTime('', now).toISOString()).toBe(now.toISOString())
  })

  it('accepts a scan from within the sync window', () => {
    const when = resolveScanTime('2026-10-18T09:30:00.000Z', now)
    expect(when.toISOString()).toBe('2026-10-18T09:30:00.000Z')
  })

  it('knows when the client sent its own scan moment', () => {
    expect(hasExplicitScanTime(undefined)).toBe(false)
    expect(hasExplicitScanTime(null)).toBe(false)
    expect(hasExplicitScanTime('')).toBe(false)
    expect(hasExplicitScanTime('2026-10-18T09:30:00.000Z')).toBe(true)
    expect(hasExplicitScanTime(new Date())).toBe(true)
  })

  it('lets a little clock skew through but not a made-up future', () => {
    expect(resolveScanTime(new Date(now.getTime() + FUTURE_GRACE_MS - 1000), now).getTime()).toBe(now.getTime() + FUTURE_GRACE_MS - 1000)
    expect(() => resolveScanTime(new Date(now.getTime() + FUTURE_GRACE_MS + 1000), now)).toThrow(/future/i)
  })

  it('refuses a scan that is too old to mean anything', () => {
    const stale = new Date(now.getTime() - MAX_SYNC_AGE_MS - 1000)
    expect(() => resolveScanTime(stale, now)).toThrow(/48 hours/i)
  })

  it('refuses values that are not dates', () => {
    expect(() => resolveScanTime('yesterday-ish', now)).toThrow(/valid date/i)
    expect(() => resolveScanTime({ when: 1 }, now)).toThrow(/ISO timestamp/i)
  })
})
