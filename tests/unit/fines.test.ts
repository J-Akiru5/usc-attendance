import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FINE_RULE,
  classifyAttendance,
  clearanceState,
  fineDeadline,
  formatPeso,
  isOutstanding,
  planFines,
  resolveRule,
  sanctionFor,
  totalCentavos,
  validateRule,
  type FineRule
} from '../../server/utils/fines'

const at = (iso: string) => new Date(iso)

/** A rule that may charge money — the citation is what makes that legal (D-01). */
const MONETARY: FineRule = {
  absentCentavos: 5000,
  lateCentavos: 2500,
  lateAfterMinutes: 15,
  sanctionType: 'monetary',
  authorityRef: 'Resolution No. 2026-004',
  effectiveFrom: at('2026-08-01T00:00:00Z')
}

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

  it('defaults to no money at all (D-01)', () => {
    expect(DEFAULT_FINE_RULE.sanctionType).toBe('warning')
    expect(DEFAULT_FINE_RULE.authorityRef).toBeNull()
    expect(DEFAULT_FINE_RULE.lateAfterMinutes).toBe(15)
  })
})

describe('sanctionFor (D-01)', () => {
  it('charges an officer when the rule carries a citation', () => {
    expect(sanctionFor('client', MONETARY)).toBe('monetary')
    expect(sanctionFor('staff', MONETARY)).toBe('monetary')
    expect(sanctionFor('super_admin', MONETARY)).toBe('monetary')
  })

  it('never charges a student, citation or not', () => {
    expect(sanctionFor('student', MONETARY)).toBe('warning')
  })

  it('never charges anyone without a citation', () => {
    expect(sanctionFor('client', { ...MONETARY, authorityRef: null })).toBe('warning')
  })

  it('keeps a non-monetary rule exactly as it is', () => {
    expect(sanctionFor('client', { ...MONETARY, sanctionType: 'service' })).toBe('service')
    expect(sanctionFor('student', { ...MONETARY, sanctionType: 'warning' })).toBe('warning')
  })
})

describe('classifyAttendance', () => {
  const opensAt = at('2026-11-02T23:30:00Z')

  it('calls a no-show an absence', () => {
    expect(classifyAttendance({ firstSeenAt: null, opensAt, lateAfterMinutes: 15 })).toBe('absent')
  })

  it('is on time until the grace period ends, late after it', () => {
    expect(classifyAttendance({ firstSeenAt: at('2026-11-02T23:40:00Z'), opensAt, lateAfterMinutes: 15 })).toBe('on_time')
    expect(classifyAttendance({ firstSeenAt: at('2026-11-02T23:45:00Z'), opensAt, lateAfterMinutes: 15 })).toBe('on_time')
    expect(classifyAttendance({ firstSeenAt: at('2026-11-02T23:45:01Z'), opensAt, lateAfterMinutes: 15 })).toBe('late')
  })

  it('treats everyone as on time when there is no opening time to be late for', () => {
    expect(classifyAttendance({ firstSeenAt: at('2026-11-03T05:00:00Z'), opensAt: null, lateAfterMinutes: 15 })).toBe('on_time')
  })
})

describe('planFines', () => {
  const opensAt = at('2026-11-02T23:30:00Z')

  it('charges officers the rule’s rates and students nothing', () => {
    // officerLate turned up late; studentAbsent never turned up at all.
    const firstSeen = new Map([['officerLate', at('2026-11-03T00:15:00Z')]])
    const roles = new Map([['officerLate', 'client'], ['studentAbsent', 'student'], ['onTime', 'student']])
    const items = planFines({ audience: ['onTime', 'officerLate', 'studentAbsent'], roles, firstSeen, opensAt, rule: MONETARY })

    const officer = items.find(item => item.userId === 'officerLate')
    const student = items.find(item => item.userId === 'studentAbsent')
    expect(officer).toEqual({ userId: 'officerLate', kind: 'late', sanctionType: 'monetary', amountCentavos: 2500 })
    // A student's absence is an obligation of service, never money.
    expect(student).toMatchObject({ userId: 'studentAbsent', kind: 'absent', sanctionType: 'warning', amountCentavos: 0 })
  })

  it('gives nobody money when the rule has no citation', () => {
    const items = planFines({
      audience: ['a'],
      roles: new Map([['a', 'client']]),
      firstSeen: new Map(),
      opensAt,
      rule: { ...MONETARY, authorityRef: null }
    })
    expect(items[0]).toMatchObject({ sanctionType: 'warning', amountCentavos: 0 })
  })

  it('treats an unknown role as a student, the safe direction', () => {
    const items = planFines({ audience: ['ghost'], roles: new Map(), firstSeen: new Map(), opensAt, rule: MONETARY })
    expect(items[0]).toMatchObject({ sanctionType: 'warning', amountCentavos: 0 })
  })

  it('never charges someone twice, even if listed twice', () => {
    const items = planFines({ audience: ['a', 'a'], roles: new Map([['a', 'client']]), firstSeen: new Map(), opensAt, rule: MONETARY })
    expect(items).toHaveLength(1)
  })

  it('charges nobody who turned up on time', () => {
    const items = planFines({
      audience: ['onTime'],
      roles: new Map([['onTime', 'client']]),
      firstSeen: new Map([['onTime', at('2026-11-02T23:35:00Z')]]),
      opensAt,
      rule: MONETARY
    })
    expect(items).toEqual([])
  })
})

describe('isOutstanding (D-01)', () => {
  it('is true for unpaid money and for an unserved service sanction', () => {
    expect(isOutstanding({ status: 'unpaid', sanctionType: 'monetary', amountCentavos: 5000 })).toBe(true)
    expect(isOutstanding({ status: 'unpaid', sanctionType: 'service', amountCentavos: 0 })).toBe(true)
  })

  it('is false for a warning, a served sanction, and anything settled', () => {
    expect(isOutstanding({ status: 'unpaid', sanctionType: 'warning', amountCentavos: 0 })).toBe(false)
    expect(isOutstanding({ status: 'unpaid', sanctionType: 'service', amountCentavos: 0, servedAt: at('2026-11-05T00:00:00Z') })).toBe(false)
    expect(isOutstanding({ status: 'paid', sanctionType: 'monetary', amountCentavos: 5000 })).toBe(false)
    expect(isOutstanding({ status: 'waived', sanctionType: 'monetary', amountCentavos: 5000 })).toBe(false)
  })
})

describe('clearanceState (D-01)', () => {
  it('clears when nothing is outstanding, counting only money as money', () => {
    expect(clearanceState([])).toEqual({ cleared: true, outstanding: 0, unpaidCentavos: 0, unpaidPesos: '₱0.00' })
    expect(clearanceState([
      { status: 'paid', sanctionType: 'monetary', amountCentavos: 5000 },
      { status: 'unpaid', sanctionType: 'warning', amountCentavos: 0 },
      { status: 'waived', sanctionType: 'monetary', amountCentavos: 2500 }
    ])).toMatchObject({ cleared: true, outstanding: 0 })
  })

  it('is not clear while an unserved service sanction stands, and says it is not money', () => {
    const state = clearanceState([{ status: 'unpaid', sanctionType: 'service', amountCentavos: 0 }])
    expect(state).toMatchObject({ cleared: false, outstanding: 1 })
    expect(state.unpaidPesos).toBe('₱0.00')
  })

  it('adds up the unpaid money', () => {
    const state = clearanceState([
      { status: 'unpaid', sanctionType: 'monetary', amountCentavos: 5000 },
      { status: 'paid', sanctionType: 'monetary', amountCentavos: 2500 }
    ])
    expect(state).toMatchObject({ cleared: false, outstanding: 1, unpaidPesos: '₱50.00' })
  })
})

describe('totalCentavos / formatPeso', () => {
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

  it('reads the sanction type and its citation', () => {
    expect(validateRule({ sanctionType: 'monetary', authorityRef: 'Resolution 2026-004', effectiveFrom: '2026-08-01T00:00:00Z' }))
      .toMatchObject({ sanctionType: 'monetary', authorityRef: 'Resolution 2026-004' })
  })

  it('refuses nonsense', () => {
    expect(() => validateRule({ absentCentavos: -1 })).toThrow(/absence fine/i)
    expect(() => validateRule({ lateCentavos: 12.5 })).toThrow(/late fine/i)
    expect(() => validateRule({ lateAfterMinutes: 500 })).toThrow(/threshold/i)
    expect(() => validateRule({ absentCentavos: 'lots' })).toThrow(/absence fine/i)
    expect(() => validateRule({ sanctionType: 'flogging' })).toThrow(/sanctionType/i)
    expect(() => validateRule({ effectiveFrom: 'not a date' })).toThrow(/effectiveFrom/i)
  })
})

describe('fineDeadline', () => {
  it('uses the closing window, or six hours after the start when there is none', () => {
    const date = at('2026-11-02T23:30:00Z')
    expect(fineDeadline({ date, checkInClosesAt: at('2026-11-03T01:00:00Z') }).toISOString()).toBe('2026-11-03T01:00:00.000Z')
    expect(fineDeadline({ date, checkInClosesAt: null }).toISOString()).toBe('2026-11-03T05:30:00.000Z')
  })
})
