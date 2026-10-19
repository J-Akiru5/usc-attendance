import { describe, expect, it } from 'vitest'
import {
  EXCUSE_ATTACHMENT_MAX_BYTES,
  excuseBlockedReason,
  validateAttachment,
  validateExcuse,
  waiverFor
} from '../../server/utils/excuses'

describe('excuseBlockedReason', () => {
  it('lets an unpaid fine be excused', () => {
    expect(excuseBlockedReason({ status: 'unpaid' }, [])).toBeNull()
    expect(excuseBlockedReason({ status: 'unpaid' }, [{ status: 'denied' }])).toBeNull()
  })

  it('refuses settled, waived, or already-pending ones', () => {
    expect(excuseBlockedReason({ status: 'paid' }, [])).toMatch(/settled/i)
    expect(excuseBlockedReason({ status: 'waived' }, [])).toMatch(/waived/i)
    expect(excuseBlockedReason({ status: 'unpaid' }, [{ status: 'pending' }])).toMatch(/waiting/i)
  })
})

describe('validateExcuse', () => {
  it('accepts a proper request', () => {
    expect(validateExcuse({ category: 'medical', reason: 'I was in the clinic with a fever.' }))
      .toEqual({ category: 'medical', reason: 'I was in the clinic with a fever.' })
  })

  it('defaults the category and trims the reason', () => {
    expect(validateExcuse({ reason: '  A family emergency came up.  ' }))
      .toEqual({ category: 'other', reason: 'A family emergency came up.' })
  })

  it('refuses a missing, too short or invented category/reason', () => {
    expect(() => validateExcuse({ reason: 'short' })).toThrow(/reason/i)
    expect(() => validateExcuse({ category: 'holiday', reason: 'A long enough reason here.' })).toThrow(/category/i)
    expect(() => validateExcuse({ reason: 'x'.repeat(2001) })).toThrow(/reason/i)
  })
})

describe('validateAttachment', () => {
  it('allows nothing when nothing was sent', () => {
    expect(validateAttachment(undefined, undefined)).toBeNull()
  })

  it('allows the three document types within the cap', () => {
    expect(validateAttachment('application/pdf', 200_000)).toEqual({ mime: 'application/pdf', size: 200_000 })
    expect(validateAttachment('image/png', 1)).toEqual({ mime: 'image/png', size: 1 })
  })

  it('refuses executables and oversized files', () => {
    expect(() => validateAttachment('application/x-msdownload', 100)).toThrow(/attachments/i)
    expect(() => validateAttachment('application/pdf', EXCUSE_ATTACHMENT_MAX_BYTES + 1)).toThrow(/5 MB/i)
    expect(() => validateAttachment('application/pdf', 1.5)).toThrow(/5 MB|byte/i)
  })
})

describe('waiverFor', () => {
  const now = new Date('2026-12-01T10:00:00Z')

  it('waives with the reviewer and note recorded', () => {
    expect(waiverFor({ id: 'f1', status: 'unpaid' }, 'staff-1', 'Medical certificate accepted', now))
      .toEqual({ status: 'waived', waivedAt: now, waivedBy: 'staff-1', waiveReason: 'Medical certificate accepted' })
  })

  it('falls back to a plain reason and refuses a settled fine', () => {
    expect(waiverFor({ id: 'f1', status: 'unpaid' }, 'staff-1', '', now).waiveReason).toBe('Excuse approved')
    expect(() => waiverFor({ id: 'f1', status: 'paid' }, 'staff-1', '', now)).toThrow(/settled/i)
  })
})
