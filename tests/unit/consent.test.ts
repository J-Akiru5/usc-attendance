import { describe, expect, it } from 'vitest'
import { CONSENT_SUMMARY, CONSENT_VERSION, consentFrom, consentIsCurrent } from '../../server/utils/consent'

describe('consentFrom', () => {
  const now = new Date('2026-10-19T10:00:00Z')

  it('records what was agreed and when', () => {
    expect(consentFrom({ consent: true }, 'register', now)).toEqual({
      consentAt: now,
      consentVersion: CONSENT_VERSION,
      consentSource: 'register'
    })
  })

  it('refuses anything that is not an explicit yes', () => {
    expect(() => consentFrom({}, 'register', now)).toThrow(/consent/i)
    expect(() => consentFrom({ consent: false }, 'register', now)).toThrow(/consent/i)
    expect(() => consentFrom({ consent: 'true' }, 'register', now)).toThrow(/consent/i)
  })

  it('records where it came from, so a paper form can be told apart later', () => {
    expect(consentFrom({ consent: true }, 'office-form', now).consentSource).toBe('office-form')
  })
})

describe('consentIsCurrent', () => {
  it('knows a stale agreement from a current one', () => {
    expect(consentIsCurrent({ consentVersion: CONSENT_VERSION })).toBe(true)
    expect(consentIsCurrent({ consentVersion: '2025-08' })).toBe(false)
    expect(consentIsCurrent({ consentVersion: null })).toBe(false)
    expect(consentIsCurrent(null)).toBe(false)
  })
})

describe('the notice summary', () => {
  it('says what is stored, who sees it and how long it is kept', () => {
    expect(CONSENT_SUMMARY).toMatch(/student number/i)
    expect(CONSENT_SUMMARY).toMatch(/retention/i)
    expect(CONSENT_SUMMARY).toMatch(/officers/i)
  })
})
