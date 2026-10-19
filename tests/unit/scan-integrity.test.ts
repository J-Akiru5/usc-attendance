import { describe, expect, it } from 'vitest'
import {
  MANUAL_REASON_MAX_LENGTH,
  decideDeviceTime,
  idempotencyKeyProblem,
  idempotencyOutcome,
  manualReasonProblem,
  normalizeIdempotencyKey,
  normalizeManualReason
} from '../../server/utils/attendance'
import { FUTURE_GRACE_MS } from '../../server/utils/offline'
import { scanIdempotencyKey } from '../../app/utils/scan-queue'

const NOW = new Date('2026-10-20T08:00:00.000Z')
const UUID = '6f1c2b8e-2a4d-4c3a-9a6e-5b1d0f7c8e21'

describe('idempotencyKeyProblem', () => {
  it('accepts a UUID and an opaque URL-safe key', () => {
    expect(idempotencyKeyProblem(UUID)).toBeNull()
    expect(idempotencyKeyProblem('scan_2026-10-20_A1b2C3')).toBeNull()
  })

  it('treats an absent key as optional rather than invalid', () => {
    expect(idempotencyKeyProblem(undefined)).toBeNull()
    expect(idempotencyKeyProblem(null)).toBeNull()
    expect(idempotencyKeyProblem('')).toBeNull()
  })

  it('refuses keys that are too short or blank once trimmed', () => {
    expect(idempotencyKeyProblem('abcd')).toMatch(/at least 8/i)
    expect(idempotencyKeyProblem('   abcdefgh   ')).toBeNull()
    expect(idempotencyKeyProblem('        ')).toMatch(/at least 8/i)
  })

  it('refuses keys that are not opaque tokens', () => {
    expect(idempotencyKeyProblem('scan key with spaces')).toMatch(/only letters/i)
    expect(idempotencyKeyProblem('scan/key#1!')).toMatch(/only letters/i)
    expect(idempotencyKeyProblem(42)).toMatch(/string/i)
  })

  it('refuses a key long enough to be used as storage', () => {
    expect(idempotencyKeyProblem('a'.repeat(129))).toMatch(/at most 128/i)
  })

  it('normalises the key that will be stored', () => {
    expect(normalizeIdempotencyKey(`  ${UUID}  `)).toBe(UUID)
    expect(normalizeIdempotencyKey(undefined)).toBeNull()
    expect(normalizeIdempotencyKey(42)).toBeNull()
  })
})

describe('idempotencyOutcome', () => {
  const stored = {
    recordedBy: 'officer-1',
    type: 'event',
    eventId: 'event-1',
    userId: 'student-1'
  }
  const request = {
    officerId: 'officer-1',
    type: 'event',
    eventId: 'event-1',
    userId: 'student-1'
  }

  it('creates when the key has never been seen', () => {
    expect(idempotencyOutcome(null, request)).toBe('create')
    expect(idempotencyOutcome(undefined, request)).toBe('create')
  })

  it('replays the first record for the same officer and the same scan', () => {
    expect(idempotencyOutcome(stored, request)).toBe('replay')
  })

  it('never lets another officer read the first officer record', () => {
    expect(idempotencyOutcome(stored, { ...request, officerId: 'officer-2' })).toBe('conflict')
  })

  it('refuses a key reused for a different student', () => {
    expect(idempotencyOutcome(stored, { ...request, userId: 'student-2' })).toBe('conflict')
  })

  it('refuses a key reused for a different event or check-in type', () => {
    expect(idempotencyOutcome(stored, { ...request, eventId: 'event-2' })).toBe('conflict')
    expect(idempotencyOutcome(stored, { ...request, type: 'duty', eventId: null })).toBe('conflict')
  })

  it('treats a missing eventId and an explicit null as the same target', () => {
    const duty = { recordedBy: 'officer-1', type: 'duty', eventId: null, userId: 'student-1' }
    const dutyRequest = { officerId: 'officer-1', type: 'duty', eventId: null, userId: 'student-1' }
    expect(idempotencyOutcome(duty, dutyRequest)).toBe('replay')
  })
})

describe('decideDeviceTime', () => {
  it('falls back to the server clock when the device sent no time', () => {
    const decision = decideDeviceTime(null, NOW)
    expect(decision.verdict).toBe('absent')
    expect(decision.scannedAt).toBeNull()
    expect(decision.effectiveAt).toBe(NOW)
    expect(decision.usedDeviceTime).toBe(false)
    expect(decision.clamped).toBe(false)
  })

  it('uses a queued scan moment from the past as the row moment', () => {
    const queuedAt = new Date(NOW.getTime() - 20 * 60_000)
    const decision = decideDeviceTime(queuedAt, NOW)
    expect(decision.verdict).toBe('behind')
    expect(decision.scannedAt).toBe(queuedAt)
    expect(decision.effectiveAt).toBe(queuedAt)
    expect(decision.usedDeviceTime).toBe(true)
    expect(decision.accepted).toBe(true)
  })

  it('accepts an exact server-clock claim', () => {
    const decision = decideDeviceTime(new Date(NOW), NOW)
    expect(decision.verdict).toBe('on-time')
    expect(decision.effectiveAt).toEqual(NOW)
  })

  it('stores a fast device clock as evidence but keeps server time authoritative', () => {
    const claimed = new Date(NOW.getTime() + 60_000)
    const decision = decideDeviceTime(claimed, NOW)
    expect(decision.verdict).toBe('ahead')
    expect(decision.scannedAt).toBe(claimed)
    expect(decision.effectiveAt).toEqual(NOW)
    expect(decision.usedDeviceTime).toBe(false)
    expect(decision.clamped).toBe(true)
    expect(decision.accepted).toBe(true)
    expect(decision.aheadMs).toBe(60_000)
  })

  it('allows the claim right up to the grace boundary', () => {
    const atBoundary = new Date(NOW.getTime() + FUTURE_GRACE_MS)
    expect(decideDeviceTime(atBoundary, NOW).accepted).toBe(true)
    const pastBoundary = new Date(NOW.getTime() + FUTURE_GRACE_MS + 1)
    expect(decideDeviceTime(pastBoundary, NOW).accepted).toBe(false)
  })

  it('honours an explicit grace window', () => {
    const claimed = new Date(NOW.getTime() + 30_000)
    expect(decideDeviceTime(claimed, NOW, 10_000).accepted).toBe(false)
    expect(decideDeviceTime(claimed, NOW, 60_000).accepted).toBe(true)
  })
})

describe('scanIdempotencyKey', () => {
  it('reuses the key the scan was queued with', () => {
    expect(scanIdempotencyKey({ id: 'local-1', idempotencyKey: '6f1c2b8e-2a4d-4c3a-9a6e-5b1d0f7c8e21' }))
      .toBe('6f1c2b8e-2a4d-4c3a-9a6e-5b1d0f7c8e21')
  })

  it('falls back to the local id for a row queued before keys existed', () => {
    expect(scanIdempotencyKey({ id: 'local-1' })).toBe('local-1')
    expect(scanIdempotencyKey({ id: 'local-1', idempotencyKey: '   ' })).toBe('local-1')
  })
})

describe('manualReasonProblem', () => {
  it('requires a reason for a manual check-in', () => {
    expect(manualReasonProblem(undefined)).toMatch(/needs a short reason/i)
    expect(manualReasonProblem(null)).toMatch(/needs a short reason/i)
    expect(manualReasonProblem('')).toMatch(/needs a short reason/i)
    expect(manualReasonProblem('   ')).toMatch(/too short/i)
  })

  it('refuses a reason that says nothing', () => {
    expect(manualReasonProblem('ok')).toMatch(/too short/i)
  })

  it('refuses a reason that is a paragraph', () => {
    expect(manualReasonProblem('x'.repeat(MANUAL_REASON_MAX_LENGTH + 1))).toMatch(/too long/i)
  })

  it('accepts a short, human explanation', () => {
    expect(manualReasonProblem('Phone dead, student showed ID')).toBeNull()
    expect(manualReasonProblem('  ID would not scan  ')).toBeNull()
    expect(manualReasonProblem(42)).toMatch(/text/i)
  })

  it('stores the reason trimmed, or nothing when none was supplied', () => {
    expect(normalizeManualReason('  Phone dead  ')).toBe('Phone dead')
    expect(normalizeManualReason('   ')).toBeNull()
    expect(normalizeManualReason(undefined)).toBeNull()
  })
})
