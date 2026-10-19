import { manilaYmd } from './time'

/**
 * Audit health (plan §11.2, benchmark BC-10).
 *
 * An audit log that stops being written still looks healthy when nobody reads
 * it. This summary answers two questions a settings manager can act on:
 *
 *   - what has the system been recording, by action, in the last 24 h and 7 d?
 *   - which actions have gone quiet today after running on each of the three
 *     previous days? ("silent gap" — an action that ran daily and has not run
 *     yet today is a signal, not necessarily a fault: a cron may simply be due
 *     later in the day.)
 *
 * The counting is pure so it can be tested without a database; the route feeds
 * it rows from the last seven days.
 */

export const AUDIT_HEALTH_ROW_LIMIT = 50_000

const DAY_MS = 86_400_000

export interface AuditEventLike {
  action: string
  createdAt: Date
}

export interface ActionCount {
  action: string
  count: number
}

export interface SilentGap {
  action: string
  today: number
  /** Oldest first: the three Manila days before today. */
  previousDays: Array<{ day: string, count: number }>
  lastSeenAt: string | null
}

export interface AuditHealth {
  generatedAt: string
  today: string
  windows: {
    last24h: { since: string, until: string }
    last7d: { since: string, until: string }
  }
  totals: { last24h: number, last7d: number, actions: number }
  counts24h: ActionCount[]
  counts7d: ActionCount[]
  silentGaps: SilentGap[]
  /** True when the route hit its row cap; the counts then cover the newest rows only. */
  truncated: boolean
}

function sortedCounts(map: Map<string, number>): ActionCount[] {
  return [...map.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action))
}

export function buildAuditHealth(
  rows: readonly AuditEventLike[],
  now: Date = new Date(),
  limit: number = AUDIT_HEALTH_ROW_LIMIT
): AuditHealth {
  const until = now.getTime()
  const since24h = until - DAY_MS
  const since7d = until - 7 * DAY_MS
  const today = manilaYmd(now)

  const counts24h = new Map<string, number>()
  const counts7d = new Map<string, number>()
  const perDay = new Map<string, Map<string, number>>()
  const lastSeen = new Map<string, Date>()

  // The three complete Manila days before today, oldest first.
  const previousDayKeys: string[] = []
  for (let back = 3; back >= 1; back--) {
    previousDayKeys.push(manilaYmd(new Date(until - back * DAY_MS)))
  }

  let scanned = 0
  for (const row of rows) {
    if (scanned >= limit) break
    scanned++

    const at = row.createdAt.getTime()
    // A clock-skewed future row is not evidence of activity today.
    if (at > until) continue

    if (at >= since24h) counts24h.set(row.action, (counts24h.get(row.action) ?? 0) + 1)
    if (at < since7d) continue

    counts7d.set(row.action, (counts7d.get(row.action) ?? 0) + 1)

    const day = manilaYmd(row.createdAt)
    const actions = perDay.get(day) ?? new Map<string, number>()
    actions.set(row.action, (actions.get(row.action) ?? 0) + 1)
    perDay.set(day, actions)

    const seen = lastSeen.get(row.action)
    if (!seen || at > seen.getTime()) lastSeen.set(row.action, row.createdAt)
  }

  const candidates = new Set<string>()
  for (const day of previousDayKeys) {
    for (const action of perDay.get(day)?.keys() ?? []) candidates.add(action)
  }

  const silentGaps: SilentGap[] = []
  for (const action of candidates) {
    const todayCount = perDay.get(today)?.get(action) ?? 0
    if (todayCount > 0) continue

    const previousDays = previousDayKeys.map(day => ({ day, count: perDay.get(day)?.get(action) ?? 0 }))
    if (!previousDays.every(day => day.count > 0)) continue

    silentGaps.push({
      action,
      today: 0,
      previousDays,
      lastSeenAt: lastSeen.get(action)?.toISOString() ?? null
    })
  }

  silentGaps.sort((a, b) => a.action.localeCompare(b.action))

  const total7d = [...counts7d.values()].reduce((sum, n) => sum + n, 0)
  const total24h = [...counts24h.values()].reduce((sum, n) => sum + n, 0)

  return {
    generatedAt: now.toISOString(),
    today,
    windows: {
      last24h: { since: new Date(since24h).toISOString(), until: new Date(until).toISOString() },
      last7d: { since: new Date(since7d).toISOString(), until: new Date(until).toISOString() }
    },
    totals: { last24h: total24h, last7d: total7d, actions: counts7d.size },
    counts24h: sortedCounts(counts24h),
    counts7d: sortedCounts(counts7d),
    silentGaps,
    truncated: rows.length > limit
  }
}
