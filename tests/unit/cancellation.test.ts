import { describe, expect, it } from 'vitest'
import { assertEventActive, cancellationBlockedReason, cancellationNotice, isEventActive } from '../../server/utils/cancellation'

describe('cancellationBlockedReason', () => {
  it('lets a live event be cancelled', () => {
    expect(cancellationBlockedReason({ status: 'scheduled', title: 'Assembly' })).toBeNull()
  })

  it('refuses one that is already cancelled', () => {
    expect(cancellationBlockedReason({ status: 'cancelled', title: 'Assembly' })).toMatch(/already cancelled/i)
  })
})

describe('assertEventActive', () => {
  it('passes a scheduled event through', () => {
    expect(() => assertEventActive({ status: 'scheduled', title: 'Assembly' })).not.toThrow()
    // An event from before this column existed has no status and is treated as live.
    expect(() => assertEventActive({ title: 'Assembly' })).not.toThrow()
    expect(() => assertEventActive({ status: null, title: 'Assembly' })).not.toThrow()
  })

  it('refuses a cancelled one, naming it', () => {
    expect(() => assertEventActive({ status: 'cancelled', title: 'Flag Ceremony' })).toThrow(/Flag Ceremony.*cancelled/i)
  })
})

describe('isEventActive', () => {
  it('tells the crons what to skip', () => {
    expect(isEventActive({ status: 'scheduled' })).toBe(true)
    expect(isEventActive({ status: null })).toBe(true)
    expect(isEventActive({ status: 'cancelled' })).toBe(false)
  })
})

describe('cancellationNotice', () => {
  it('says what it means and what stops', () => {
    const notice = cancellationNotice('General Assembly', null)
    expect(notice).toMatch(/cancelled/i)
    expect(notice).toMatch(/no longer applies/i)
  })

  it('includes the reason when there is one, bounded', () => {
    expect(cancellationNotice('Assembly', '  Typhoon signal 3  ')).toMatch(/Typhoon signal 3/)
    expect(cancellationNotice('Assembly', 'x'.repeat(400)).length).toBeLessThan(400)
    expect(cancellationNotice('Assembly', '   ')).not.toMatch(/Reason given/)
  })
})
