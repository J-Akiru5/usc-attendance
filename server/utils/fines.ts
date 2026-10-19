import { badRequest } from './http'

/**
 * Absence fines (plan §8.5). Everything here is pure and every amount is an
 * integer number of **centavos**, so ₱50 is 5000 and nothing can round twice on
 * the way from a rule to a receipt.
 *
 * Precedence: an event's own rule wins, then its category's, then the global
 * default. The rule that produced a fine is snapshotted onto the row, so a later
 * rate change never rewrites history.
 */
export interface FineRule {
  absentCentavos: number
  lateCentavos: number
  lateAfterMinutes: number
}

export const DEFAULT_FINE_RULE: FineRule = {
  absentCentavos: 5000, // ₱50.00
  lateCentavos: 2500, // ₱25.00
  lateAfterMinutes: 30
}

export function resolveRule(global: FineRule | null, category: FineRule | null, event: FineRule | null): FineRule {
  return { ...DEFAULT_FINE_RULE, ...(global ?? {}), ...(category ?? {}), ...(event ?? {}) }
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
  amountCentavos: number
}

/**
 * Who owes what for one event: only the required audience, only the people who
 * were absent or late, one item each, with the amount taken from the resolved
 * rule. Anyone who was on time owes nothing.
 */
export function planFines(input: {
  audience: string[]
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

    if (verdict === 'absent') items.push({ userId, kind: 'absent', amountCentavos: input.rule.absentCentavos })
    else if (verdict === 'late') items.push({ userId, kind: 'late', amountCentavos: input.rule.lateCentavos })
  }

  return items
}

/** What a set of fines adds up to, unpaid ones only by default. */
export function totalCentavos(fines: Array<{ amountCentavos: number, status?: string }>, onlyUnpaid = true): number {
  return fines.reduce((sum, fine) => {
    if (onlyUnpaid && fine.status !== undefined && fine.status !== 'unpaid') return sum
    return sum + fine.amountCentavos
  }, 0)
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
  const readInt = (key: keyof FineRule, min: number, max: number, label: string): number => {
    const raw = body[key]
    if (raw === undefined) return current[key]
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) {
      throw badRequest(`${label} must be a whole number between ${min} and ${max}`)
    }
    return value
  }

  return {
    absentCentavos: readInt('absentCentavos', 0, 100_000, 'The absence fine (centavos)'),
    lateCentavos: readInt('lateCentavos', 0, 100_000, 'The late fine (centavos)'),
    lateAfterMinutes: readInt('lateAfterMinutes', 0, 240, 'The late threshold (minutes)')
  }
}

/** When an event's fines are settled enough to generate: after the window closes. */
export function fineDeadline(event: { date: Date, checkInClosesAt: Date | null }, fallbackHours = 6): Date {
  if (event.checkInClosesAt) return event.checkInClosesAt
  return new Date(event.date.getTime() + fallbackHours * 3600_000)
}
