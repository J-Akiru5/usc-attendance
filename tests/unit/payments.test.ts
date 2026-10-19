import { describe, expect, it } from 'vitest'
import {
  clearanceCode,
  clearanceState,
  normaliseCode,
  paymentBlockedReason,
  publicVerification,
  validatePayment
} from '../../server/utils/payments'

describe('paymentBlockedReason', () => {
  it('lets an unpaid fine be settled', () => {
    expect(paymentBlockedReason({ status: 'unpaid' })).toBeNull()
  })

  it('refuses one that is already paid or was waived', () => {
    expect(paymentBlockedReason({ status: 'paid' })).toMatch(/already settled/i)
    expect(paymentBlockedReason({ status: 'waived' })).toMatch(/waived/i)
  })
})

describe('validatePayment', () => {
  const fine = { amountCentavos: 5000, status: 'unpaid' }

  it('accepts the full amount with a reference', () => {
    expect(validatePayment({ method: 'cash', reference: 'OR-2026-00123', note: ' paid at the office ' }, fine))
      .toEqual({ method: 'cash', reference: 'OR-2026-00123', amountCentavos: 5000, note: 'paid at the office' })
  })

  it('defaults the amount to what is owed', () => {
    expect(validatePayment({ method: 'gcash', reference: 'GC-8891234' }, fine).amountCentavos).toBe(5000)
  })

  it('refuses an invented method, a missing reference and a wrong amount', () => {
    expect(() => validatePayment({ method: 'cheque', reference: 'X-1' }, fine)).toThrow(/method must be/i)
    expect(() => validatePayment({ method: 'cash', reference: '' }, fine)).toThrow(/reference is needed/i)
    expect(() => validatePayment({ method: 'cash', reference: 'OR-1', amountCentavos: 2500 }, fine)).toThrow(/full amount/i)
    expect(() => validatePayment({ method: 'cash', reference: 'OR-1', amountCentavos: 5000.5 }, fine)).toThrow(/full amount/i)
  })

  it('caps the note and blank it out when empty', () => {
    expect(validatePayment({ method: 'cash', reference: 'OR-1', note: '   ' }, fine).note).toBeNull()
    expect(validatePayment({ method: 'cash', reference: 'OR-1', note: 'x'.repeat(400) }, fine).note?.length).toBe(300)
  })
})

describe('clearanceCode', () => {
  it('is the requested length and avoids characters that confuse', () => {
    const code = clearanceCode(() => 0.999999, 10)
    expect(code).toHaveLength(10)
    expect(code).not.toMatch(/[IO01]/)
    expect(clearanceCode(() => 0, 4)).toBe('AAAA')
  })

  it('differs run to run in practice', () => {
    const codes = new Set(Array.from({ length: 50 }, () => clearanceCode()))
    expect(codes.size).toBeGreaterThan(45)
  })
})

describe('normaliseCode', () => {
  it('accepts a code however a person typed it', () => {
    expect(normaliseCode(' ab-cd 2345 ')).toBe('ABCD2345')
    expect(normaliseCode('')).toBe('')
  })
})

describe('clearanceState', () => {
  it('clears when nothing is unpaid', () => {
    expect(clearanceState([])).toEqual({ cleared: true, unpaidCentavos: 0, unpaidPesos: '₱0.00' })
    expect(clearanceState([
      { amountCentavos: 5000, status: 'paid' },
      { amountCentavos: 2500, status: 'waived' }
    ])).toEqual({ cleared: true, unpaidCentavos: 0, unpaidPesos: '₱0.00' })
  })

  it('is not clear while money is owed, and says how much', () => {
    const state = clearanceState([
      { amountCentavos: 5000, status: 'unpaid' },
      { amountCentavos: 2500, status: 'paid' }
    ])
    expect(state.cleared).toBe(false)
    expect(state.unpaidPesos).toBe('₱50.00')
  })
})

describe('publicVerification', () => {
  const now = new Date('2026-12-01T10:00:00Z')
  const clearance = { code: 'ABCD2345XY', issuedAt: new Date('2026-11-20T02:00:00Z'), coveredCentavos: 7500, revokedAt: null }
  const student = { name: 'Juan Dela Cruz', studentNo: '2024-00123' }

  it('confirms a live certificate with the minimum of detail', () => {
    const result = publicVerification({ clearance, student, currentlyCleared: true, now })
    expect(result).toMatchObject({
      status: 'valid',
      name: 'Juan Dela Cruz',
      studentNo: '2024-00123',
      coveredPesos: '₱75.00',
      checkedAt: now.toISOString()
    })
  })

  it('says so when the student owes money again', () => {
    expect(publicVerification({ clearance, student, currentlyCleared: false, now }).status).toBe('no-longer-cleared')
  })

  it('honours a revocation, and knows nothing about a code it never issued', () => {
    expect(publicVerification({ clearance: { ...clearance, revokedAt: now }, student, currentlyCleared: true, now }).status).toBe('revoked')
    expect(publicVerification({ clearance: null, student: null, currentlyCleared: true, now })).toEqual({ status: 'unknown', checkedAt: now.toISOString() })
    expect(publicVerification({ clearance, student: null, currentlyCleared: true, now }).status).toBe('unknown')
  })
})
