import { describe, expect, it } from 'vitest'
import {
  LOW_FREE_BYTES,
  MAX_PENDING_SCANS,
  acknowledgementIds,
  canQueueScan,
  formatBytes,
  planFlush,
  queueOwnership,
  refusalsAcknowledged,
  storageAdvice,
  unacknowledgedRefusals,
  unsyncedBanner,
  type QueuedScan,
  type RefusedScan
} from '../../app/utils/scan-queue'
import { FUTURE_GRACE_MS, MAX_SYNC_AGE_MS, hasExplicitScanTime, resolveScanTime } from '../../server/utils/offline'

const scan = (id: string, scannedAt = '2026-10-18T01:00:00.000Z', recordedBy?: string): QueuedScan => ({
  id,
  kind: 'barcode',
  eventId: 'e1',
  label: `Student ${id}`,
  lat: 10.72,
  lng: 122.56,
  accuracy: 8,
  scannedAt,
  ...(recordedBy ? { recordedBy } : {})
})

const refusal = (id: string, reason = 'Already checked in.'): RefusedScan => ({
  scan: scan(id),
  reason,
  at: '2026-10-18T02:00:00.000Z'
})

const MB = 1024 * 1024
const GB = 1024 * MB

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

describe('canQueueScan (hard cap)', () => {
  it('allows a scan below the cap and says how much room is left', () => {
    const room = canQueueScan(498)
    expect(room.allowed).toBe(true)
    expect(room.atCap).toBe(false)
    expect(room.remaining).toBe(2)
    expect(room.message).toBeNull()
  })

  it('refuses at the cap with a loud, actionable message', () => {
    const room = canQueueScan(MAX_PENDING_SCANS)
    expect(room.allowed).toBe(false)
    expect(room.atCap).toBe(true)
    expect(room.remaining).toBe(0)
    expect(room.message).toContain(String(MAX_PENDING_SCANS))
    expect(room.message).toMatch(/maximum/i)
    expect(room.message).toMatch(/sync now/i)
  })

  it('keeps refusing above the cap and never reports negative room', () => {
    const room = canQueueScan(MAX_PENDING_SCANS + 20)
    expect(room.allowed).toBe(false)
    expect(room.remaining).toBe(0)
  })

  it('honours a smaller cap and normalises nonsense counts', () => {
    expect(canQueueScan(2, 2).allowed).toBe(false)
    expect(canQueueScan(-4).count).toBe(0)
    expect(canQueueScan(Number.NaN).allowed).toBe(true)
  })
})

describe('unsyncedBanner', () => {
  it('stays hidden when the queue is clear', () => {
    const banner = unsyncedBanner({ pending: 0, notRecorded: 0, persisted: true })
    expect(banner.visible).toBe(false)
    expect(banner.label).toBe('')
    expect(banner.tone).toBe('warning')
  })

  it('shows the single-scan wording a reload must preserve', () => {
    const banner = unsyncedBanner({ pending: 1, notRecorded: 0, persisted: true })
    expect(banner.visible).toBe(true)
    expect(banner.label).toBe('1 unsynced scan')
  })

  it('combines queued scans with unacknowledged refusals and turns urgent', () => {
    const banner = unsyncedBanner({ pending: 3, notRecorded: 2, persisted: true })
    expect(banner.label).toBe('3 unsynced scans · 2 not recorded')
    expect(banner.notRecorded).toBe(2)
    expect(banner.tone).toBe('danger')
  })

  it('only counts refusals until they are acknowledged', () => {
    expect(unsyncedBanner({ pending: 0, notRecorded: 1 }).visible).toBe(true)
    expect(unsyncedBanner({ pending: 0, notRecorded: 0 }).visible).toBe(false)
  })

  it('is loud at the hard cap', () => {
    const banner = unsyncedBanner({ pending: MAX_PENDING_SCANS, notRecorded: 0, persisted: true })
    expect(banner.atCap).toBe(true)
    expect(banner.tone).toBe('danger')
    expect(banner.label).toBe(`${MAX_PENDING_SCANS} unsynced scans`)
  })

  it('warns about a refused persistence request only while work is queued', () => {
    const withWork = unsyncedBanner({ pending: 2, notRecorded: 0, persisted: false })
    expect(withWork.tone).toBe('danger')
    expect(withWork.storageWarning).toMatch(/discard unsynced scans/i)

    const empty = unsyncedBanner({ pending: 0, notRecorded: 1, persisted: false })
    expect(empty.storageWarning).toBeNull()
  })
})

describe('queueOwnership (T-0008)', () => {
  const A = 'officer-a-uuid'
  const B = 'officer-b-uuid'

  it('lets the first officer claim an empty phone', () => {
    const decision = queueOwnership({ officerId: A, queueOwnerId: null, scans: [] })
    expect(decision.state).toBe('mine')
    expect(decision.ownerId).toBe(A)
    expect(decision.locked).toBe(false)
    expect(decision.message).toBeNull()
  })

  it('keeps the owner queue in place for the same officer', () => {
    const scans = [scan('a', undefined, A), scan('b', undefined, A)]
    const decision = queueOwnership({ officerId: A, queueOwnerId: A, scans })
    expect(decision.state).toBe('mine')
    expect(decision.pending.map(row => row.id)).toEqual(['a', 'b'])
    expect(decision.park).toEqual([])
    expect(decision.locked).toBe(false)
  })

  it('refuses a second officer and sends nothing', () => {
    const scans = [scan('a', undefined, A), scan('b', undefined, A)]
    const decision = queueOwnership({ officerId: B, queueOwnerId: A, scans })
    expect(decision.state).toBe('foreign')
    expect(decision.locked).toBe(true)
    expect(decision.pending).toEqual([])
    expect(decision.ownerId).toBe(A)
    expect(decision.message).toMatch(/different officer/i)
    expect(decision.message).toMatch(/nothing was sent/i)
  })

  it('never reveals the first officer identity in the refusal', () => {
    const scans = [scan('a', undefined, A)]
    const decision = queueOwnership({ officerId: B, queueOwnerId: A, scans })
    expect(decision.message).not.toContain(A)
    expect(decision.message).not.toContain('officer-a')
    expect(JSON.stringify({ ...decision, ownerId: undefined })).not.toContain(A)
  })

  it('does not lock a phone forever when the queue is already empty', () => {
    const decision = queueOwnership({ officerId: B, queueOwnerId: A, scans: [] })
    expect(decision.state).toBe('mine')
    expect(decision.ownerId).toBe(B)
    expect(decision.locked).toBe(false)
  })

  it('parks rows queued before ownership was recorded instead of guessing', () => {
    const scans = [scan('legacy-1'), scan('legacy-2')]
    const decision = queueOwnership({ officerId: A, queueOwnerId: null, scans })
    expect(decision.state).toBe('mine')
    expect(decision.pending).toEqual([])
    expect(decision.park.map(row => row.id)).toEqual(['legacy-1', 'legacy-2'])
    expect(decision.message).toMatch(/set aside/i)
    expect(decision.message).toMatch(/2 unsynced scans/i)
  })

  it('parks legacy rows even when the signed-in officer owns the rest', () => {
    const scans = [scan('legacy'), scan('owned', undefined, A)]
    const decision = queueOwnership({ officerId: A, queueOwnerId: A, scans })
    expect(decision.state).toBe('mine')
    expect(decision.park.map(row => row.id)).toEqual(['legacy'])
    expect(decision.pending.map(row => row.id)).toEqual(['owned'])
  })

  it('derives the owner when the meta record is missing', () => {
    const scans = [scan('a', undefined, A), scan('b', undefined, A)]
    const decision = queueOwnership({ officerId: A, queueOwnerId: null, scans })
    expect(decision.state).toBe('mine')
    expect(decision.ownerId).toBe(A)
  })

  it('refuses an unattributed queue owned by someone else, even without meta', () => {
    const scans = [scan('a', undefined, A)]
    const decision = queueOwnership({ officerId: B, queueOwnerId: null, scans })
    expect(decision.state).toBe('foreign')
    expect(decision.pending).toEqual([])
    expect(decision.locked).toBe(true)
  })

  it('refuses a queue that names more than one officer', () => {
    const scans = [scan('a', undefined, A), scan('b', undefined, B)]
    const decision = queueOwnership({ officerId: A, queueOwnerId: null, scans })
    expect(decision.state).toBe('foreign')
    expect(decision.ownerId).toBeNull()
    expect(decision.pending).toEqual([])
    expect(decision.message).toMatch(/more than one officer/i)
  })

  it('treats a meta owner that disagrees with the rows as mixed', () => {
    const scans = [scan('b', undefined, B)]
    const decision = queueOwnership({ officerId: B, queueOwnerId: A, scans })
    expect(decision.state).toBe('foreign')
    expect(decision.pending).toEqual([])
  })
})

describe('unsyncedBanner (T-0008)', () => {
  it('says a foreign queue is not this officer work', () => {
    const banner = unsyncedBanner({ pending: 2, notRecorded: 0, persisted: true, foreignOwner: true })
    expect(banner.visible).toBe(true)
    expect(banner.label).toBe('2 unsynced scans from another officer')
    expect(banner.tone).toBe('danger')
  })

  it('keeps the ordinary wording for the owning officer', () => {
    expect(unsyncedBanner({ pending: 2, notRecorded: 0, foreignOwner: false }).label).toBe('2 unsynced scans')
  })
})

describe('refusal acknowledgement', () => {
  it('filters rows the officer already acknowledged', () => {
    const rows = [refusal('a'), refusal('b'), refusal('c')]
    expect(unacknowledgedRefusals(rows, ['a', 'c']).map(row => row.scan.id)).toEqual(['b'])
  })

  it('treats the list as acknowledged only when every row is covered', () => {
    const rows = [refusal('a'), refusal('b')]
    expect(refusalsAcknowledged(rows, ['a', 'b'])).toBe(true)
    expect(refusalsAcknowledged([...rows, refusal('c')], ['a', 'b'])).toBe(false)
    expect(refusalsAcknowledged([], [])).toBe(false)
  })

  it('builds a de-duplicated id set to persist', () => {
    expect(acknowledgementIds([refusal('a'), refusal('a'), refusal('b')])).toEqual(['a', 'b'])
  })
})

describe('storageAdvice', () => {
  it('says nothing when storage is protected and there is room', () => {
    const advice = storageAdvice({ persisted: true, quota: 2 * GB, usage: 100 * MB })
    expect(advice.level).toBe('ok')
    expect(advice.persistRefused).toBe(false)
    expect(advice.lowSpace).toBe(false)
    expect(advice.message).toBeNull()
  })

  it('says plainly that a refused request may lose the queue', () => {
    const advice = storageAdvice({ persisted: false, quota: 2 * GB, usage: 100 * MB })
    expect(advice.level).toBe('watch')
    expect(advice.persistRefused).toBe(true)
    expect(advice.message).toMatch(/refused/i)
    expect(advice.message).toMatch(/discard unsynced scans/i)
  })

  it('shows the free space when the phone is nearly full', () => {
    const advice = storageAdvice({ persisted: true, quota: 2 * GB, usage: 2 * GB - MB })
    expect(advice.level).toBe('critical')
    expect(advice.lowSpace).toBe(true)
    expect(advice.freeBytes).toBe(MB)
    expect(advice.freeLabel).toBe('1.0 MB')
    expect(advice.message).toContain('Only 1.0 MB free')
  })

  it('treats a low share of a large quota as low even above the byte floor', () => {
    const quota = 4 * GB
    const advice = storageAdvice({ persisted: true, quota, usage: quota - 60 * MB })
    expect(advice.freeBytes).toBeGreaterThan(LOW_FREE_BYTES)
    expect(advice.level).toBe('critical')
    expect(advice.lowSpace).toBe(true)
  })

  it('warns before space becomes critical', () => {
    const advice = storageAdvice({ persisted: true, quota: GB, usage: 930 * MB })
    expect(advice.level).toBe('watch')
    expect(advice.lowSpace).toBe(false)
    expect(advice.freeLabel).toBe('94 MB')
    expect(advice.message).toMatch(/getting low/i)
  })

  it('does not invent a warning when the browser will not estimate', () => {
    expect(storageAdvice({ persisted: true, quota: null, usage: null }).level).toBe('ok')
    const unknown = storageAdvice({ persisted: null, quota: null, usage: null })
    expect(unknown.level).toBe('unknown')
    expect(unknown.message).toMatch(/cannot confirm/i)
  })

  it('ignores negative or non-numeric estimates', () => {
    const advice = storageAdvice({ persisted: true, quota: -1, usage: Number.NaN })
    expect(advice.freeBytes).toBeNull()
    expect(advice.level).toBe('ok')
  })
})

describe('formatBytes', () => {
  it('uses whole bytes and readable units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1.5 * MB)).toBe('1.5 MB')
    expect(formatBytes(120 * MB)).toBe('120 MB')
    expect(formatBytes(-1)).toBe('unknown')
  })
})
