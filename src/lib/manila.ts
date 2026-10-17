/** Helpers for <input type="datetime-local"> values, which are Philippine local time here. */

/** ISO timestamp -> "YYYY-MM-DDTHH:mm" in Asia/Manila (for an input's value). */
export function isoToManilaInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

/** "YYYY-MM-DDTHH:mm" typed as Manila time -> ISO timestamp, or null when empty. */
export function manilaInputToIso(value: string): string | null {
  if (!value) return null
  return new Date(`${value}:00+08:00`).toISOString()
}

export function formatManila(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}
