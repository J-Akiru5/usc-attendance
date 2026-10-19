import type { AudienceLike } from './analytics'
import { matchesAudience, type AudienceSpec, type AudienceType } from './audience'
import { fineDeadline } from './fines'

/**
 * The expected roster, frozen at the moment an event's check-in window closes
 * (benchmark BC-4, plan §8.2/§8.3/§8.5).
 *
 * "Who was expected" used to be resolved live every time it was read, so a
 * student who transferred college after an assembly could be charged (or
 * missed), and a report exported in October could not be reproduced in
 * November. The rows written from this planner are that population as it stood
 * at the close, with enough placement context to explain each row even after
 * the student moves.
 *
 * Everything in this file is pure: the routes and the fine cron read the
 * database, this file decides. `server/utils/expected-data.ts` holds the queries
 * and the write.
 */

/** One person as they stood when the snapshot was taken. */
export interface ExpectedMember extends AudienceLike {
  userId: string
}

/** A row of `event_expected` (the shape the write needs, not the Prisma row). */
export interface ExpectedRow {
  eventId: string
  userId: string
  /** The event's audience type at snapshot time: all | college | yearLevel | section. */
  source: AudienceType
  collegeId: string | null
  yearLevel: number | null
  sectionId: string | null
  snapshotAt: Date
}

/** An existing snapshot row, as read back for the diff. */
export interface ExistingExpectedRow {
  userId: string
  source: string
  collegeId: string | null
  yearLevel: number | null
  sectionId: string | null
  snapshotAt: Date
}

export interface SnapshotPlan {
  eventId: string
  source: AudienceType
  /** The ids the snapshot says were expected, in a stable order. */
  audienceIds: string[]
  /** The rows to write if the plan is applied. */
  rows: ExpectedRow[]
  created: string[]
  removed: string[]
  changed: string[]
  /** True when the existing snapshot already says exactly this — write nothing. */
  unchanged: boolean
  /** The freeze time: the existing one when unchanged, otherwise `now`. */
  snapshotAt: Date
}

/**
 * Is it time to snapshot? The same boundary the fine generator uses — the
 * check-in close, or six hours after the start when no close is set. A cancelled
 * event never freezes (there was nothing to attend, so nothing to be absent
 * from).
 */
export function snapshotDue(
  event: { date: Date, checkInClosesAt: Date | null, status?: string | null },
  now: Date,
  fallbackHours = 6
): boolean {
  if (event.status === 'cancelled') return false
  return fineDeadline(event, fallbackHours).getTime() <= now.getTime()
}

/**
 * The would-be snapshot: every member the event's audience selects, once, with
 * the placement that made them match. Placement is copied, not referenced — it
 * is a record of why the person was expected, not a live view of where they are
 * now.
 */
export function expectedRows(input: {
  eventId: string
  spec: AudienceSpec
  members: ExpectedMember[]
  snapshotAt: Date
}): ExpectedRow[] {
  const seen = new Set<string>()
  const rows: ExpectedRow[] = []

  for (const member of input.members) {
    if (seen.has(member.userId)) continue
    if (!matchesAudience(member, input.spec)) continue
    seen.add(member.userId)
    rows.push({
      eventId: input.eventId,
      userId: member.userId,
      source: input.spec.type,
      collegeId: member.collegeId ?? null,
      yearLevel: member.yearLevel ?? null,
      sectionId: member.sectionId ?? null,
      snapshotAt: input.snapshotAt
    })
  }

  return rows.sort((a, b) => a.userId.localeCompare(b.userId))
}

/** The latest `snapshotAt` in a set of rows, or null when nothing is frozen. */
export function frozenAt(rows: ExistingExpectedRow[]): Date | null {
  let latest: Date | null = null
  for (const row of rows) {
    if (!latest || row.snapshotAt.getTime() > latest.getTime()) latest = row.snapshotAt
  }
  return latest
}

/**
 * The frozen ids, or null when there is no snapshot. A non-empty snapshot always
 * wins over a live resolve — that is the whole point of BC-4.
 */
export function frozenAudience(rows: ExistingExpectedRow[]): string[] | null {
  if (rows.length === 0) return null
  return [...new Set(rows.map(row => row.userId))].sort((a, b) => a.localeCompare(b))
}

/**
 * The answer to "does an existing snapshot win?": yes, whenever it has rows.
 * Only an event that has never been frozen falls back to the live resolve.
 */
export function expectedAudience(frozen: ExistingExpectedRow[], live: string[]): string[] {
  return frozenAudience(frozen) ?? [...new Set(live)].sort((a, b) => a.localeCompare(b))
}

/**
 * Diff a would-be snapshot against the one that already exists. This is what
 * makes both the automatic freeze and the manual one idempotent: an identical
 * plan is `unchanged`, so the caller writes nothing and the original
 * `snapshotAt` survives. A real change (a joiner, a leaver, a placement
 * correction, a different audience type) replaces the snapshot with a new time.
 */
export function planSnapshot(input: {
  eventId: string
  spec: AudienceSpec
  members: ExpectedMember[]
  existing: ExistingExpectedRow[]
  now: Date
}): SnapshotPlan {
  const rows = expectedRows({
    eventId: input.eventId,
    spec: input.spec,
    members: input.members,
    snapshotAt: input.now
  })

  const desired = new Map(rows.map(row => [row.userId, row]))
  const current = new Map<string, ExistingExpectedRow>()
  for (const row of input.existing) {
    // Duplicates should not exist (unique event+user); if they do, the newest
    // row is the one being compared against, never an arbitrary one.
    const prior = current.get(row.userId)
    if (!prior || row.snapshotAt.getTime() > prior.snapshotAt.getTime()) current.set(row.userId, row)
  }

  const created = [...desired.keys()].filter(userId => !current.has(userId)).sort()
  const removed = [...current.keys()].filter(userId => !desired.has(userId)).sort()
  const changed = [...desired.keys()]
    .filter((userId) => {
      const before = current.get(userId)
      if (!before) return false
      const after = desired.get(userId)!
      return before.source !== after.source
        || before.collegeId !== after.collegeId
        || before.yearLevel !== after.yearLevel
        || before.sectionId !== after.sectionId
    })
    .sort()

  // A first freeze is a change even when the audience is empty: it is the
  // moment the event's roster became a record. An identical existing snapshot
  // is the idempotent case.
  const unchanged = input.existing.length > 0 && created.length === 0 && removed.length === 0 && changed.length === 0

  return {
    eventId: input.eventId,
    source: input.spec.type,
    audienceIds: rows.map(row => row.userId),
    rows,
    created,
    removed,
    changed,
    unchanged,
    snapshotAt: unchanged ? (frozenAt(input.existing) ?? input.now) : input.now
  }
}
