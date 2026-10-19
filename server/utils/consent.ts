import { badRequest } from './http'

/**
 * Consent (plan §11.2, amended after the benchmark review's BC-1): the register
 * route accepted `consent: true` from the day it was written but never *stored*
 * it, so the system could not demonstrate that anyone agreed to anything. Under
 * the Data Privacy Act a controller must be able to show consent, so the record
 * is versioned — the notice is expected to change, and "they agreed" is
 * meaningless without saying to what.
 */
export const CONSENT_VERSION = '2026-10'

/** The one-line summary of what a student is agreeing to, shown at sign-up. */
export const CONSENT_SUMMARY = 'USC Attendance stores your name, student number, course placement, attendance records (with a signature where you sign) and any clearance you are issued, to run council attendance, fines and clearance. Officers of the council see these records; nobody else does. Records are kept for the retention period in the council privacy notice, then purged. You may ask the council to correct your details, and you may close your account.'

export interface ConsentRecord {
  consentAt: Date
  consentVersion: string
  consentSource: string
}

/** Validates the box was actually ticked, and returns what to store. */
export function consentFrom(body: Record<string, unknown>, source = 'register', now: Date = new Date()): ConsentRecord {
  if (body.consent !== true) {
    throw badRequest('Consent to the privacy notice is required to register')
  }
  return { consentAt: now, consentVersion: CONSENT_VERSION, consentSource: source }
}

/** True when the account agreed to the current notice (older versions are stale). */
export function consentIsCurrent(consent: { consentVersion: string | null } | null, version = CONSENT_VERSION): boolean {
  return consent?.consentVersion === version
}
