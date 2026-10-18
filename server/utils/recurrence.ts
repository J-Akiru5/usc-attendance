/**
 * Recurring events (plan §8.2). A documented subset of RFC 5545 — enough for
 * what the USC actually runs (weekly flag ceremonies, bi-weekly assemblies,
 * monthly seminars) without pulling in a dependency:
 *
 *   FREQ=DAILY | WEEKLY | MONTHLY     (required)
 *   INTERVAL=<1..52>                  (default 1)
 *   BYDAY=MO,TU,...                   (weekly only)
 *   UNTIL=<date>                      (inclusive)
 *   COUNT=<2..MAX_OCCURRENCES>
 *
 * COUNT and UNTIL are mutually exclusive, as in the RFC. Monthly rules keep the
 * day-of-month and skip months that do not have it (the 31st), and everything is
 * computed in UTC — the Philippines has no DST, so instance times never shift.
 */
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface RecurrenceSpec {
  freq: RecurrenceFreq
  interval: number
  /** Weeks days that apply to weekly rules, 0 = Sunday (JS convention). */
  byday: number[]
  until: Date | null
  count: number | null
}

export const MAX_OCCURRENCES = 200

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const FREQS: RecurrenceFreq[] = ['DAILY', 'WEEKLY', 'MONTHLY']

/** Parses a rule; throws `Error` with a human message when it is not understood. */
export function parseRrule(rule: string): RecurrenceSpec {
  const parts = String(rule ?? '').trim().split(';').filter(Boolean)
  if (parts.length === 0) throw new Error('Recurrence rule is empty')

  const spec: RecurrenceSpec = { freq: 'WEEKLY', interval: 1, byday: [], until: null, count: null }
  let freq: string | null = null

  for (const part of parts) {
    const [rawKey = '', rawValue = ''] = part.split('=')
    const key = (rawKey ?? '').trim().toUpperCase()
    const value = rawValue.trim().toUpperCase()

    if (key === 'FREQ') {
      if (!FREQS.includes(value as RecurrenceFreq)) throw new Error(`Unsupported FREQ "${rawValue.trim()}" — use DAILY, WEEKLY or MONTHLY`)
      freq = value
    } else if (key === 'INTERVAL') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > 52) throw new Error('INTERVAL must be a whole number between 1 and 52')
      spec.interval = n
    } else if (key === 'BYDAY') {
      const days = value.split(',').filter(Boolean)
      if (days.length === 0) throw new Error('BYDAY needs at least one weekday')
      for (const day of days) {
        const index = WEEKDAYS[day]
        if (index === undefined) throw new Error(`Unknown weekday "${day}" — use MO, TU, WE, TH, FR, SA, SU`)
        if (!spec.byday.includes(index)) spec.byday.push(index)
      }
      spec.byday.sort((a, b) => a - b)
    } else if (key === 'UNTIL') {
      const raw = rawValue.trim()
      // Accept ISO timestamps/dates and the compact RFC form (YYYYMMDD[THHmmss]Z).
      const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/)
      const parsed = compact
        ? new Date(Date.UTC(Number(compact[1]), Number(compact[2]) - 1, Number(compact[3]), Number(compact[4] ?? 23), Number(compact[5] ?? 59), Number(compact[6] ?? 59)))
        : new Date(raw)
      if (Number.isNaN(parsed.getTime())) throw new Error('UNTIL is not a valid date')
      spec.until = parsed
    } else if (key === 'COUNT') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 2 || n > MAX_OCCURRENCES) throw new Error(`COUNT must be a whole number between 2 and ${MAX_OCCURRENCES}`)
      spec.count = n
    } else {
      throw new Error(`Unknown rule part "${rawKey.trim()}"`)
    }
  }

  if (!freq) throw new Error('Recurrence rule needs FREQ (DAILY, WEEKLY or MONTHLY)')
  spec.freq = freq as RecurrenceFreq

  if (spec.count !== null && spec.until !== null) throw new Error('Use either UNTIL or COUNT, not both')
  if (spec.byday.length > 0 && spec.freq !== 'WEEKLY') throw new Error('BYDAY only applies to weekly rules')

  return spec
}

/** The canonical string for a parsed spec (what we store). */
export function formatRrule(spec: RecurrenceSpec): string {
  const parts = [`FREQ=${spec.freq}`]
  if (spec.interval !== 1) parts.push(`INTERVAL=${spec.interval}`)
  if (spec.byday.length > 0) parts.push(`BYDAY=${spec.byday.map(d => Object.keys(WEEKDAYS).find(k => WEEKDAYS[k] === d)).join(',')}`)
  if (spec.until) parts.push(`UNTIL=${spec.until.toISOString()}`)
  else if (spec.count !== null) parts.push(`COUNT=${spec.count}`)
  return parts.join(';')
}

/** A short sentence for the UI. */
export function describeRecurrence(spec: RecurrenceSpec): string {
  const every = spec.interval === 1 ? '' : `${spec.interval} `
  let text: string
  if (spec.freq === 'DAILY') text = spec.interval === 1 ? 'Every day' : `Every ${spec.interval} days`
  else if (spec.freq === 'MONTHLY') text = spec.interval === 1 ? 'Every month' : `Every ${spec.interval} months`
  else if (spec.byday.length > 0) text = `Every ${every}week on ${spec.byday.map(d => WEEKDAY_NAMES[d]).join(', ')}`
  else text = spec.interval === 1 ? 'Every week' : `Every ${spec.interval} weeks`

  if (spec.count !== null) return `${text}, ${spec.count} times`
  if (spec.until) return `${text}, until ${spec.until.toISOString().slice(0, 10)}`
  return text
}

function addMonths(date: Date, months: number): Date | null {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  if (date.getUTCDate() > lastDay) return null
  target.setUTCDate(date.getUTCDate())
  return target
}

/**
 * The next month that actually has the anchor's day-of-month, stepping
 * `interval` months at a time (a 31st anchor walks Jan → Mar → May → Jul…).
 */
function nextMonthWithDay(anchor: Date, interval: number): Date | null {
  for (let step = 1; step <= 60; step++) {
    const candidate = addMonths(anchor, step * interval)
    if (candidate) return candidate
  }
  return null
}

/**
 * Dates of the whole series, oldest first, `start` (the master) always first.
 * Stops at COUNT, at UNTIL (inclusive) or at the safety cap; `truncated` says
 * the rule wanted more than the cap.
 */
export function expandRecurrence(
  spec: RecurrenceSpec,
  start: Date,
  options: { max?: number } = {}
): { occurrences: Date[], truncated: boolean } {
  const max = options.max ?? MAX_OCCURRENCES
  const occurrences: Date[] = [new Date(start)]
  if (spec.count !== null && occurrences.length >= spec.count) return { occurrences, truncated: false }

  const withinBounds = (date: Date): boolean => {
    if (spec.until && date.getTime() > spec.until.getTime()) return false
    return true
  }

  let guard = 0
  const hardStop = max * 4 + 400 // enough iterations for interval/until combinations

  if (spec.freq === 'WEEKLY' && spec.byday.length > 0) {
    // Walk week by week (starting from the week containing the master) and take
    // the requested weekdays; anything before the master's own moment is skipped.
    const weekStart = new Date(start)
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay())
    weekStart.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds())

    for (let week = 0; guard < hardStop; week++) {
      guard++
      const base = new Date(weekStart)
      base.setUTCDate(base.getUTCDate() + week * 7 * spec.interval)
      if (spec.until && base.getTime() > spec.until.getTime()) break
      for (const day of spec.byday) {
        const candidate = new Date(base)
        candidate.setUTCDate(candidate.getUTCDate() + day)
        if (candidate.getTime() <= start.getTime()) continue
        if (!withinBounds(candidate)) return { occurrences, truncated: false }
        occurrences.push(candidate)
        if (occurrences.length >= max) return { occurrences, truncated: true }
        if (spec.count !== null && occurrences.length >= spec.count) return { occurrences, truncated: false }
      }
    }
    return { occurrences, truncated: false }
  }

  let cursor = new Date(start)
  while (guard < hardStop) {
    guard++
    const next = new Date(cursor)
    if (spec.freq === 'DAILY') next.setUTCDate(next.getUTCDate() + spec.interval)
    else if (spec.freq === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7 * spec.interval)
    else {
      // The 31st walks Jan → Mar → May → Jul…: step to the next month that
      // actually has the anchor's day rather than shifting the day itself.
      const shifted = nextMonthWithDay(cursor, spec.interval)
      if (!shifted) return { occurrences, truncated: false }
      next.setTime(shifted.getTime())
    }

    if (!withinBounds(next)) return { occurrences, truncated: false }
    occurrences.push(next)
    if (occurrences.length >= max) return { occurrences, truncated: true }
    if (spec.count !== null && occurrences.length >= spec.count) return { occurrences, truncated: false }
    cursor = next
  }

  return { occurrences, truncated: false }
}

export interface PlannedSeriesChange {
  /** Occurrences to create (dates not represented yet). */
  create: Date[]
  /** Existing rows that stay exactly as they are. */
  keep: string[]
  /** Existing rows the rule no longer wants and that hold no data. */
  remove: string[]
  /** Existing rows the rule no longer wants but that are kept because of data. */
  locked: string[]
}

/**
 * Works out how to move an existing series to `desired` without touching an
 * instance that already has attendance or registrations attached.
 */
export function planSeriesChanges(
  desired: Date[],
  existing: Array<{ id: string, date: Date, locked: boolean }>
): PlannedSeriesChange {
  const wanted = desired.map(d => d.getTime())
  const change: PlannedSeriesChange = { create: [], keep: [], remove: [], locked: [] }
  const takenKeys = new Set<number>()

  for (const row of existing) {
    const key = row.date.getTime()
    if (wanted.includes(key)) {
      change.keep.push(row.id)
      takenKeys.add(key)
    } else if (row.locked) {
      change.locked.push(row.id)
    } else {
      change.remove.push(row.id)
    }
  }

  for (const date of desired) {
    if (!takenKeys.has(date.getTime())) change.create.push(date)
  }

  return change
}
