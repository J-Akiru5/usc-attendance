import { HttpError, badRequest } from './http'
import { requireCapability } from './rbac'

export interface SemesterLike {
  id?: string
  name: string
  startsOn: Date
  endsOn: Date // exclusive
}

export const MAX_RETENTION_SEMESTERS = 8
export const MAX_GRACE_DAYS = 365
const DAY_MS = 86_400_000

/** Settings managers: super admin, the President/Secretary (canDelegate), or anyone flagged canConfigure. */
export function canManageSettings(u: { role: string, canDelegate?: boolean, canConfigure?: boolean }): boolean {
  return u.role === 'super_admin' || u.canDelegate === true || u.canConfigure === true
}

/** Settings managers: the super admin, or anyone holding `settings.manage`. */
export function requireSettingsManager(u: { capabilities?: readonly string[] }): void {
  requireCapability(u, 'settings.manage')
}

export function parseRetention(body: unknown): { signatureRetentionSemesters: number, purgeGraceDays: number } {
  const b = (body ?? {}) as Record<string, unknown>
  const n = Number(b.signatureRetentionSemesters)
  const g = Number(b.purgeGraceDays)
  if (!Number.isInteger(n) || n < 1 || n > MAX_RETENTION_SEMESTERS) {
    throw badRequest(`Keep signatures for 1 to ${MAX_RETENTION_SEMESTERS} semesters`)
  }
  if (!Number.isInteger(g) || g < 0 || g > MAX_GRACE_DAYS) {
    throw badRequest(`Grace period must be 0 to ${MAX_GRACE_DAYS} days`)
  }
  return { signatureRetentionSemesters: n, purgeGraceDays: g }
}

/** A plain YYYY-MM-DD is a Philippine calendar day (midnight +08:00); anything else is parsed as a full timestamp. */
function parseDay(v: unknown): Date {
  const str = typeof v === 'string' ? v.trim() : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T00:00:00+08:00`) : new Date(str)
}

/** Validate a semester definition against the existing ones (no overlap, start before end). */
export function validateSemester(
  input: { name: unknown, startsOn: unknown, endsOn: unknown },
  existing: SemesterLike[]
): SemesterLike {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 3 || name.length > 80) throw badRequest('Semester name must be 3 to 80 characters')
  const startsOn = parseDay(input.startsOn)
  const endsOn = parseDay(input.endsOn)
  if (Number.isNaN(startsOn.getTime()) || Number.isNaN(endsOn.getTime())) {
    throw badRequest('Start and end dates must be valid dates')
  }
  if (endsOn.getTime() <= startsOn.getTime()) throw badRequest('The semester must end after it starts')
  if (endsOn.getTime() - startsOn.getTime() > 400 * DAY_MS) throw badRequest('A semester cannot be longer than about a year')
  for (const e of existing) {
    if (startsOn < e.endsOn && e.startsOn < endsOn) {
      throw new HttpError(409, `Dates overlap with "${e.name}"`)
    }
  }
  return { name, startsOn, endsOn }
}

/**
 * Semesters whose signature images are due for deletion. A signature belongs to the
 * semester its signing time falls in and is kept for `keep` semesters (that one
 * counts as the first). Once the last semester of that span has ended plus the
 * grace period, the image goes. If the later semesters are not defined yet, nothing
 * expires - we never guess an end date.
 */
export function expiredSemesters(
  semesters: SemesterLike[],
  keep: number,
  graceDays: number,
  now: Date = new Date()
): SemesterLike[] {
  const sorted = [...semesters].sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime())
  const out: SemesterLike[] = []
  sorted.forEach((sem, i) => {
    const last = sorted[i + keep - 1]
    if (!last) return
    if (now.getTime() >= last.endsOn.getTime() + graceDays * DAY_MS) out.push(sem)
  })
  return out
}

// ---------------------------------------------------------------------------
// Check-in window
// ---------------------------------------------------------------------------
export interface WindowLike {
  checkInOpensAt: Date | null
  checkInClosesAt: Date | null
}

const fmt = (d: Date) =>
  d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })

/** Throws 403 if `now` is outside the event's check-in window. No window = always open. */
export function assertCheckInOpen(event: WindowLike, now: Date = new Date()): void {
  if (event.checkInOpensAt && now.getTime() < event.checkInOpensAt.getTime()) {
    throw new HttpError(403, `Check-in has not opened yet. It opens ${fmt(event.checkInOpensAt)}.`)
  }
  if (event.checkInClosesAt && now.getTime() > event.checkInClosesAt.getTime()) {
    throw new HttpError(403, `Check-in closed ${fmt(event.checkInClosesAt)}.`)
  }
}

export function parseWindow(body: unknown): { checkInOpensAt: Date | null, checkInClosesAt: Date | null } {
  const b = (body ?? {}) as Record<string, unknown>
  const one = (v: unknown, label: string): Date | null => {
    if (v === undefined || v === null || v === '') return null
    const d = new Date(v as string)
    if (Number.isNaN(d.getTime())) throw badRequest(`${label} is not a valid date and time`)
    return d
  }
  const opens = one(b.checkInOpensAt, 'Opening time')
  const closes = one(b.checkInClosesAt, 'Closing time')
  if (opens && closes && closes.getTime() <= opens.getTime()) {
    throw badRequest('Check-in must close after it opens')
  }
  return { checkInOpensAt: opens, checkInClosesAt: closes }
}
