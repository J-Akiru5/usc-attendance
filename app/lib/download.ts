import { getSupabaseClient } from '@/lib/api'

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

/** Download an event's attendance report. Throws with the server's message on failure. */
export async function downloadAttendance(eventId: string, format: ExportFormat, title = 'attendance') {
  const client = getSupabaseClient()
  const session = client ? (await client.auth.getSession()).data.session : null

  const res = await fetch(
    `/api/attendance/export?eventId=${encodeURIComponent(eventId)}&format=${format}`,
    { headers: { Authorization: `Bearer ${session?.access_token}` } }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Export failed (${res.status})`)
  }

  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[^a-zA-Z0-9]+/g, '-')}-attendance.${format}`
  a.click()
  URL.revokeObjectURL(url)
}

/** Download a proposal's liquidation report (plan §8.7). */
export async function downloadLiquidation(proposalId: string, format: ExportFormat, title = 'liquidation') {
  const client = getSupabaseClient()
  const session = client ? (await client.auth.getSession()).data.session : null

  const res = await fetch(
    `/api/finance/liquidation?proposalId=${encodeURIComponent(proposalId)}&format=${format}`,
    { headers: { Authorization: `Bearer ${session?.access_token}` } }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Export failed (${res.status})`)
  }

  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `liquidation-${title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report'}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
