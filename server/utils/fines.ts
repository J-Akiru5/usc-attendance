import { badRequest } from './http'

/**
 * Absence sanctions (plan §8.5, decision D-01). Everything here is pure and every
 * amount is an integer number of **centavos**, so ₱50 is 5000 and nothing can
 * round twice on the way from a rule to a receipt.
 *
 * D-01 is the heart of this file: a **monetary** sanction is for an *officer* and
 * only when the rule carries the council's citation. A regular student is never
 * charged money for an absence — their breach is a warning or service. A warning
 * is never an obligation; an unserved service sanction is one, exactly like an
 * unpaid fine, and clearance reads it that way.
 *
 * Precedence: an event's own rule wins, then its category's, then the global
 * default. The rule that produced a fine is snapshotted onto the row, so a later
 * rate change never rewrites history.
 */
export type SanctionType = 'monetary' | 'warning' | 'service'
export const SANCTION_TYPES: SanctionType[] = ['monetary', 'warning', 'service']

export interface FineRule {
  absentCentavos: number
  lateCentavos: number
  lateAfterMinutes: number
  sanctionType: SanctionType
  /** The resolution / by-law that permits charging money, if it does. */
  authorityRef: string | null
  effectiveFrom: Date | null
}

export const DEFAULT_FINE_RULE: FineRule = {
  absentCentavos: 5000, // ₱50.00
  lateCentavos: 2500, // ₱25.00
  // D-05: fifteen minutes, matching the council-facing proposal; every event can
  // still override it, and the settings screen edits it.
  lateAfterMinutes: 15,
  // D-01: no money until the council records its citation (C-1).
  sanctionType: 'warning',
  authorityRef: null,
  effectiveFrom: null
}

export function resolveRule(
  global: Partial<FineRule> | null,
  category: Partial<FineRule> | null,
  event: Partial<FineRule> | null
): FineRule {
  return { ...DEFAULT_FINE_RULE, ...(global ?? {}), ...(category ?? {}), ...(event ?? {}) }
}

/**
 * D-01, in one function: money is for an officer, and only with a citation.
 * Anything else falls back to the rule's own non-monetary type — a warning never
 * accidentally becomes a charge.
 */
export function sanctionFor(role: string, rule: FineRule): SanctionType {
  if (rule.sanctionType !== 'monetary') return rule.sanctionType
  if (role === 'student') return 'warning'
  if (!rule.authorityRef) return 'warning'
  return 'monetary'
}

export type AttendanceVerdict = 'absent' | 'late' | 'on_time'

/**
 * A student is late when they first turned up later than the grace period after
 * the check-in window opens (falling back to the event's own start time when no
 * window is set). Never turning up is an absence, whoever they are.
 */
export function classifyAttendance(input: {
  firstSeenAt: Date | null
  opensAt: Date | null
  lateAfterMinutes: number
}): AttendanceVerdict {
  if (!input.firstSeenAt) return 'absent'
  if (!input.opensAt) return 'on_time'
  const threshold = input.opensAt.getTime() + input.lateAfterMinutes * 60_000
  return input.firstSeenAt.getTime() > threshold ? 'late' : 'on_time'
}

export interface FinePlanItem {
  userId: string
  kind: 'absent' | 'late'
  sanctionType: SanctionType
  amountCentavos: number
}

/**
 * Who owes what for one event: only the required audience, only the people who
 * were absent or late, one item each. The amount is the rule's rate for a
 * monetary sanction and **zero** otherwise — a service sanction is served, not
 * paid.
 */
export function planFines(input: {
  audience: string[]
  /** userId → role, so officers and students can be sanctioned differently. */
  roles: Map<string, string>
  firstSeen: Map<string, Date>
  opensAt: Date | null
  rule: FineRule
}): FinePlanItem[] {
  const seen = new Set<string>()
  const items: FinePlanItem[] = []

  for (const userId of input.audience) {
    if (seen.has(userId)) continue
    seen.add(userId)

    const verdict = classifyAttendance({
      firstSeenAt: input.firstSeen.get(userId) ?? null,
      opensAt: input.opensAt,
      lateAfterMinutes: input.rule.lateAfterMinutes
    })
    if (verdict === 'on_time') continue

    // An unknown role is treated as a student: the safe direction.
    const sanctionType = sanctionFor(input.roles.get(userId) ?? 'student', input.rule)
    const amountCentavos = sanctionType === 'monetary'
      ? (verdict === 'absent' ? input.rule.absentCentavos : input.rule.lateCentavos)
      : 0

    items.push({ userId, kind: verdict, sanctionType, amountCentavos })
  }

  return items
}

export interface OutstandingFine {
  status: string
  sanctionType?: string
  amountCentavos: number
  servedAt?: Date | null
}

/**
 * D-01: a warning is never an obligation; a monetary fine is outstanding while
 * unpaid, and a service sanction while unserved.
 */
export function isOutstanding(fine: OutstandingFine): boolean {
  if (fine.status !== 'unpaid') return false
  if (fine.sanctionType === 'warning') return false
  return !fine.servedAt
}

/** What a set of fines adds up to, unpaid money only by default. */
export function totalCentavos(fines: Array<{ amountCentavos: number, status?: string }>, onlyUnpaid = true): number {
  return fines.reduce((sum, fine) => {
    if (onlyUnpaid && fine.status !== undefined && fine.status !== 'unpaid') return sum
    return sum + fine.amountCentavos
  }, 0)
}

export interface ClearanceState {
  cleared: boolean
  /** Everything outstanding, money or service. */
  outstanding: number
  unpaidCentavos: number
  unpaidPesos: string
}

/**
 * Cleared means nothing outstanding — money or service (D-01). A warning never
 * blocks; an unserved service sanction does.
 */
export function clearanceState(fines: Array<OutstandingFine>): ClearanceState {
  const outstanding = fines.filter(isOutstanding).length
  const unpaid = totalCentavos(fines.filter(fine => (fine.sanctionType ?? 'monetary') === 'monetary'))
  return { cleared: outstanding === 0, outstanding, unpaidCentavos: unpaid, unpaidPesos: formatPeso(unpaid) }
}

/** "₱50.00", "₱25.50", "₱0.00". */
export function formatPeso(centavos: number): string {
  const sign = centavos < 0 ? '-' : ''
  const absolute = Math.abs(Math.round(centavos))
  const pesos = Math.floor(absolute / 100)
  const cents = String(absolute % 100).padStart(2, '0')
  return `${sign}₱${pesos.toLocaleString('en-PH')}.${cents}`
}

/** Validates a rule a manager is trying to save. */
export function validateRule(body: Record<string, unknown>, current: FineRule = DEFAULT_FINE_RULE): FineRule {
  const readInt = (key: 'absentCentavos' | 'lateCentavos' | 'lateAfterMinutes', min: number, max: number, label: string): number => {
    const raw = body[key]
    if (raw === undefined) return current[key]
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) {
      throw badRequest(`${label} must be a whole number between ${min} and ${max}`)
    }
    return value
  }

  const sanctionType = body.sanctionType === undefined ? current.sanctionType : String(body.sanctionType)
  if (!(SANCTION_TYPES as string[]).includes(sanctionType)) {
    throw badRequest(`sanctionType must be one of ${SANCTION_TYPES.join(', ')}`)
  }

  const authorityRef = body.authorityRef === undefined
    ? current.authorityRef
    : (body.authorityRef === null || body.authorityRef === '' ? null : String(body.authorityRef).trim().slice(0, 200))

  let effectiveFrom = current.effectiveFrom
  if (body.effectiveFrom !== undefined) {
    if (body.effectiveFrom === null || body.effectiveFrom === '') effectiveFrom = null
    else {
      const parsed = new Date(String(body.effectiveFrom))
      if (Number.isNaN(parsed.getTime())) throw badRequest('effectiveFrom is not a valid date')
      effectiveFrom = parsed
    }
  }

  return {
    absentCentavos: readInt('absentCentavos', 0, 100_000, 'The absence fine (centavos)'),
    lateCentavos: readInt('lateCentavos', 0, 100_000, 'The late fine (centavos)'),
    lateAfterMinutes: readInt('lateAfterMinutes', 0, 240, 'The late threshold (minutes)'),
    sanctionType: sanctionType as SanctionType,
    authorityRef,
    effectiveFrom
  }
}

/** When an event's fines are settled enough to generate: after the window closes. */
export function fineDeadline(event: { date: Date, checkInClosesAt: Date | null }, fallbackHours = 6): Date {
  if (event.checkInClosesAt) return event.checkInClosesAt
  return new Date(event.date.getTime() + fallbackHours * 3600_000)
}
