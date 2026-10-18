/**
 * Attendance analytics (plan §8.3). Every number the dashboards show is computed
 * here from rows the routes fetch, so the maths is unit-tested and can be
 * reconciled against the raw exports (the phase's acceptance test).
 *
 * "Expected" is the honest tricky part: audience targeting (§8.2's required
 * audience) is not built yet, so an event that takes registrations counts its
 * registrants, and one that does not counts the active students. The definition
 * lives in `expectedForEvent` below — one place to change when audience
 * targeting lands.
 */
export interface AttendanceLike {
  userId: string
  method: string
  createdAt: Date
  hasSignature?: boolean
}

export interface AudienceLike {
  userId: string
  collegeId?: string | null
  yearLevel?: number | null
  sectionId?: string | null
}

/** Manila runs UTC+8 all year — no DST — matching `manilaDayRange` and the exports. */
export const MANILA_OFFSET_HOURS = 8

/** A rate that never divides by zero; 0 seats of 0 turns is 0, not NaN. */
export function rate(attended: number, expected: number): number {
  if (expected <= 0) return 0
  return Math.min(1, attended / expected)
}

/** Distinct people who turned up (a student may check out and back in). */
export function attendedIds(rows: AttendanceLike[]): Set<string> {
  return new Set(rows.map(row => row.userId))
}

/** Who was expected but never appeared, in the order they were given. */
export function noShows(expected: string[], attended: Set<string>): string[] {
  const seen = new Set<string>()
  const missing: string[] = []
  for (const userId of expected) {
    if (attended.has(userId) || seen.has(userId)) continue
    seen.add(userId)
    missing.push(userId)
  }
  return missing
}

/** Check-ins per hour of the Manila day (24 buckets, 0 = midnight). */
export function timingHistogram(rows: { createdAt: Date }[]): Array<{ hour: number, count: number }> {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  for (const row of rows) {
    const hour = (row.createdAt.getUTCHours() + MANILA_OFFSET_HOURS) % 24
    buckets[hour]!.count += 1
  }
  return buckets
}

/** The busiest hour, or null when nobody checked in (ties go to the earlier hour). */
export function peakHour(buckets: Array<{ hour: number, count: number }>): number | null {
  let best: { hour: number, count: number } | null = null
  for (const bucket of buckets) {
    if (bucket.count > 0 && (!best || bucket.count > best.count)) best = bucket
  }
  return best?.hour ?? null
}

export type GroupKey = 'collegeId' | 'yearLevel' | 'sectionId'

/** Rate per group, unplaced people gathered under `unplaced`. */
export function groupRates(
  members: AudienceLike[],
  attended: Set<string>,
  key: GroupKey
): Array<{ key: string, expected: number, attended: number, rate: number }> {
  const groups = new Map<string, { expected: number, attended: number }>()

  for (const member of members) {
    const raw = member[key]
    const group = raw === null || raw === undefined || raw === '' ? 'unplaced' : String(raw)
    const entry = groups.get(group) ?? { expected: 0, attended: 0 }
    entry.expected += 1
    if (attended.has(member.userId)) entry.attended += 1
    groups.set(group, entry)
  }

  return [...groups.entries()]
    .map(([groupKey, entry]) => ({ key: groupKey, ...entry, rate: rate(entry.attended, entry.expected) }))
    .sort((a, b) => b.expected - a.expected || a.key.localeCompare(b.key))
}

/** Students ordered by how often they turned up (deterministic ties). */
export function rankStudents(
  counts: Map<string, number>,
  order: 'top' | 'bottom',
  limit: number
): Array<{ userId: string, count: number }> {
  const rows = [...counts.entries()].map(([userId, count]) => ({ userId, count }))
  rows.sort((a, b) => {
    const byCount = order === 'top' ? b.count - a.count : a.count - b.count
    return byCount !== 0 ? byCount : a.userId.localeCompare(b.userId)
  })
  return limit > 0 ? rows.slice(0, limit) : rows
}

/** How people were recorded, biggest first. */
export function methodMix(rows: AttendanceLike[]): Array<{ method: string, count: number }> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.method, (counts.get(row.method) ?? 0) + 1)
  return [...counts.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count || a.method.localeCompare(b.method))
}

/** Share of the people who turned up and also signed. */
export function signatureRate(rows: AttendanceLike[]): number {
  const attended = attendedIds(rows)
  if (attended.size === 0) return 0
  const signed = new Set(rows.filter(row => row.hasSignature).map(row => row.userId))
  return rate(signed.size, attended.size)
}

/**
 * The interim definition of "expected" (see the file header): registrants when
 * an event takes registrations, otherwise every active student.
 */
export function expectedForEvent(input: { registrationRequired: boolean, registrants: number, activeStudents: number }): number {
  if (input.registrationRequired) return input.registrants
  return input.activeStudents
}
