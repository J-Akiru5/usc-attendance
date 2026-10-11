const MANILA = 'Asia/Manila'

/** Manila calendar date (YYYY-MM-DD) for a given instant. */
export function manilaYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA }).format(d)
}

/** Day of week in Manila (0 = Sunday .. 6 = Saturday). */
export function manilaDow(d: Date = new Date()): number {
  return new Date(`${manilaYmd(d)}T00:00:00Z`).getUTCDay()
}

/**
 * Half-open [gte, lt) range covering the Manila calendar day containing `d`.
 * Manila has no DST, so the day is always exactly 24h starting at +08:00.
 */
export function manilaDayRange(d: Date = new Date()): { gte: Date; lt: Date } {
  const gte = new Date(`${manilaYmd(d)}T00:00:00+08:00`)
  return { gte, lt: new Date(gte.getTime() + 86_400_000) }
}

/** HH:MM in Manila time, 24h, zero-padded. */
export function manilaHHMM(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MANILA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hh}:${mm}`
}
