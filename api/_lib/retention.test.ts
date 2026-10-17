import { describe, expect, it } from 'vitest'
import { HttpError } from './http.js'
import {
  assertCheckInOpen,
  canManageSettings,
  expiredSemesters,
  parseRetention,
  parseWindow,
  requireSettingsManager,
  validateSemester,
  type SemesterLike,
} from './retention.js'

const d = (s: string) => new Date(s + 'T00:00:00+08:00')
const sem = (name: string, a: string, b: string): SemesterLike => ({ name, startsOn: d(a), endsOn: d(b) })

const S1 = sem('1st 2025-26', '2025-08-01', '2025-12-21')
const S2 = sem('2nd 2025-26', '2026-01-05', '2026-05-31')
const S3 = sem('1st 2026-27', '2026-08-01', '2026-12-21')

function http(fn: () => unknown, status: number, part?: string) {
  try {
    fn()
    expect.unreachable('expected HttpError')
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError)
    expect((e as HttpError).status).toBe(status)
    if (part) expect((e as HttpError).message).toContain(part)
  }
}

describe('who can manage settings', () => {
  it('super admin, President/Secretary (canDelegate) and canConfigure only', () => {
    expect(canManageSettings({ role: 'super_admin' })).toBe(true)
    expect(canManageSettings({ role: 'staff', canDelegate: true })).toBe(true)
    expect(canManageSettings({ role: 'client', canConfigure: true })).toBe(true)
    expect(canManageSettings({ role: 'staff' })).toBe(false)
    expect(canManageSettings({ role: 'student', canConfigure: false })).toBe(false)
    http(() => requireSettingsManager({ role: 'client' }), 403, 'adviser')
    expect(() => requireSettingsManager({ role: 'client', canConfigure: true })).not.toThrow()
  })
})

describe('parseRetention', () => {
  it('accepts sensible values and rejects the rest', () => {
    expect(parseRetention({ signatureRetentionSemesters: 2, purgeGraceDays: 30 })).toEqual({ signatureRetentionSemesters: 2, purgeGraceDays: 30 })
    http(() => parseRetention({ signatureRetentionSemesters: 0, purgeGraceDays: 30 }), 400)
    http(() => parseRetention({ signatureRetentionSemesters: 9, purgeGraceDays: 30 }), 400)
    http(() => parseRetention({ signatureRetentionSemesters: 1.5, purgeGraceDays: 30 }), 400)
    http(() => parseRetention({ signatureRetentionSemesters: 1, purgeGraceDays: -1 }), 400)
    http(() => parseRetention({ signatureRetentionSemesters: 1, purgeGraceDays: 400 }), 400)
    http(() => parseRetention({}), 400)
  })
})

describe('validateSemester', () => {
  it('accepts a clean semester and trims the name', () => {
    const r = validateSemester({ name: '  1st Sem  ', startsOn: '2026-08-01', endsOn: '2026-12-21' }, [S1, S2])
    expect(r.name).toBe('1st Sem')
  })
  it('rejects bad names/dates, reversed ranges, over-long ranges', () => {
    http(() => validateSemester({ name: 'x', startsOn: '2026-08-01', endsOn: '2026-12-21' }, []), 400)
    http(() => validateSemester({ name: 'Valid', startsOn: 'nope', endsOn: '2026-12-21' }, []), 400)
    http(() => validateSemester({ name: 'Valid', startsOn: '2026-12-21', endsOn: '2026-08-01' }, []), 400, 'end after')
    http(() => validateSemester({ name: 'Valid', startsOn: '2026-01-01', endsOn: '2028-01-01' }, []), 400, 'longer')
  })
  it('rejects overlaps (409) but allows back-to-back', () => {
    http(() => validateSemester({ name: 'Overlap', startsOn: '2025-12-01', endsOn: '2026-02-01' }, [S1, S2]), 409, 'overlap')
    expect(() => validateSemester({ name: 'Adjacent', startsOn: '2025-12-21', endsOn: '2026-01-05' }, [S1, S2])).not.toThrow()
  })
})

describe('expiredSemesters', () => {
  it('keep=1: a semester expires after it ends plus grace', () => {
    const justAfter = new Date(S1.endsOn.getTime() + 10 * 86_400_000)
    expect(expiredSemesters([S1, S2, S3], 1, 30, justAfter)).toEqual([])
    const afterGrace = new Date(S1.endsOn.getTime() + 31 * 86_400_000)
    expect(expiredSemesters([S1, S2, S3], 1, 30, afterGrace).map((s) => s.name)).toEqual(['1st 2025-26'])
  })
  it('keep=2: also waits for the next semester to end', () => {
    const afterS1Grace = new Date(S1.endsOn.getTime() + 60 * 86_400_000)
    expect(expiredSemesters([S1, S2, S3], 2, 30, afterS1Grace)).toEqual([])
    const afterS2Grace = new Date(S2.endsOn.getTime() + 31 * 86_400_000)
    expect(expiredSemesters([S1, S2, S3], 2, 30, afterS2Grace).map((s) => s.name)).toEqual(['1st 2025-26'])
  })
  it('never expires when the later semesters are not defined yet', () => {
    const far = new Date('2030-01-01')
    expect(expiredSemesters([S1], 2, 0, far)).toEqual([])
    expect(expiredSemesters([S1, S2], 3, 0, far)).toEqual([])
  })
  it('works regardless of input order and with zero grace', () => {
    const out = expiredSemesters([S3, S1, S2], 1, 0, new Date(S2.endsOn.getTime() + 1))
    expect(out.map((s) => s.name)).toEqual(['1st 2025-26', '2nd 2025-26'])
  })
})

describe('check-in window', () => {
  const now = new Date('2026-11-10T02:00:00Z')
  it('no window means always open', () => {
    expect(() => assertCheckInOpen({ checkInOpensAt: null, checkInClosesAt: null }, now)).not.toThrow()
  })
  it('blocks before opening and after closing, allows inside', () => {
    const w = { checkInOpensAt: new Date('2026-11-10T01:00:00Z'), checkInClosesAt: new Date('2026-11-10T04:00:00Z') }
    expect(() => assertCheckInOpen(w, now)).not.toThrow()
    http(() => assertCheckInOpen(w, new Date('2026-11-10T00:30:00Z')), 403, 'not opened')
    http(() => assertCheckInOpen(w, new Date('2026-11-10T04:00:01Z')), 403, 'closed')
  })
  it('supports open-only and close-only windows', () => {
    expect(() => assertCheckInOpen({ checkInOpensAt: new Date('2026-11-10T01:00:00Z'), checkInClosesAt: null }, now)).not.toThrow()
    http(() => assertCheckInOpen({ checkInOpensAt: null, checkInClosesAt: new Date('2026-11-10T01:00:00Z') }, now), 403)
  })
  it('parseWindow validates', () => {
    expect(parseWindow({})).toEqual({ checkInOpensAt: null, checkInClosesAt: null })
    expect(parseWindow({ checkInOpensAt: '2026-11-10T01:00:00Z', checkInClosesAt: '' }).checkInClosesAt).toBeNull()
    http(() => parseWindow({ checkInOpensAt: 'nope' }), 400)
    http(() => parseWindow({ checkInOpensAt: '2026-11-10T05:00:00Z', checkInClosesAt: '2026-11-10T04:00:00Z' }), 400, 'after it opens')
  })
})
