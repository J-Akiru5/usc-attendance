import { badRequest } from './http.js'

export const STUDENT_EMAIL_DOMAIN = 'isufst.edu.ph'
export const STUDENT_ROLE = 'student'

export interface RegistrationInput {
  email: string
  name: string
  studentNo: string
  program: string | null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Lower-cased email, only if it is exactly user@isufst.edu.ph (no subdomains, no plus tricks on the domain). */
export function normalizeStudentEmail(raw: unknown): string {
  const email = str(raw).trim().toLowerCase()
  if (email.length > 254 || !/^[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9.-]+$/.test(email)) {
    throw badRequest('Enter a valid email address')
  }
  if (!email.endsWith('@' + STUDENT_EMAIL_DOMAIN)) {
    throw badRequest(`Use your @${STUDENT_EMAIL_DOMAIN} school email`)
  }
  return email
}

export function normalizeStudentNo(raw: unknown): string {
  const no = str(raw).trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9-]{3,19}$/.test(no)) {
    throw badRequest('Student ID must be 4-20 letters, numbers or dashes')
  }
  return no
}

export function normalizeName(raw: unknown): string {
  const name = str(raw).replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 100 || !/^[\p{L}][\p{L}\s.,'’-]*$/u.test(name)) {
    throw badRequest('Enter your full name (letters, spaces, . , \' - only)')
  }
  return name
}

export function validatePassword(raw: unknown, email: string): string {
  const pw = str(raw)
  if (pw.length < 8 || pw.length > 72) {
    throw badRequest('Password must be 8 to 72 characters')
  }
  const local = email.split('@')[0]
  if (pw.toLowerCase().includes(local) && local.length >= 4) {
    throw badRequest('Password must not contain your email name')
  }
  return pw
}

/**
 * Parse and validate a registration request body. Throws 400 with a user-facing message.
 * No password is taken here: the student sets it after proving they own the inbox, so
 * nobody can pre-register someone else's email with a password they know.
 */
export function parseRegistration(body: unknown): RegistrationInput {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.consent !== true) {
    throw badRequest('You must accept the Data Privacy notice to register')
  }
  const email = normalizeStudentEmail(b.email)
  const programRaw = str(b.program).trim()
  if (programRaw.length > 60) throw badRequest('Program is too long')
  return {
    email,
    name: normalizeName(b.name),
    studentNo: normalizeStudentNo(b.studentNo),
    program: programRaw || null,
  }
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const xf = headers['x-forwarded-for']
  const first = (Array.isArray(xf) ? xf[0] : xf)?.split(',')[0]?.trim()
  return first || 'unknown'
}

export interface RateLimitDb {
  auditLog: {
    count(args: { where: { action: string; createdAt: { gt: Date }; details: { contains: string } } }): Promise<number>
  }
}

/**
 * Sliding-window limit backed by the audit log. Returns true if the caller is
 * over the limit. `key` is embedded in the log row's details so it can be counted.
 */
export async function overLimit(
  db: RateLimitDb,
  action: string,
  key: string,
  max: number,
  windowMs: number,
  now: Date = new Date()
): Promise<boolean> {
  const n = await db.auditLog.count({
    where: { action, createdAt: { gt: new Date(now.getTime() - windowMs) }, details: { contains: key } },
  })
  return n >= max
}
