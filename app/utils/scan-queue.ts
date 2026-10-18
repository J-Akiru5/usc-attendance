/**
 * Offline scanner queue (plan §8.2): a scan taken where the signal is poor is
 * kept on the phone with the moment it happened, then sent when the connection
 * returns. The server judges it as of that moment, so a genuine scan is never
 * lost — but a refusal (already checked in, outside the venue, no grant) is a
 * real answer, not a network problem, and the officer needs to see it.
 */
export interface QueuedScan {
  id: string
  kind: 'qr' | 'barcode' | 'manual'
  eventId: string
  /** Who or what was scanned, for the officer's list. */
  label: string
  token?: string
  userId?: string
  lat: number | null
  lng: number | null
  accuracy: number | null
  /** When the scan happened, not when it was sent. */
  scannedAt: string
}

export interface RefusedScan {
  scan: QueuedScan
  reason: string
  at: string
}

export type FlushResult
  = | { id: string, outcome: 'synced' }
    | { id: string, outcome: 'retry' }
    | { id: string, outcome: 'refused', reason: string }

export interface FlushPlan {
  synced: QueuedScan[]
  retry: QueuedScan[]
  refused: Array<{ scan: QueuedScan, reason: string }>
}

/**
 * Splits a queue against what came back. Anything not attempted (no result) is
 * kept for the next attempt — the flusher stops at the first network failure, so
 * that is the normal case for the tail of the queue.
 */
export function planFlush(scans: QueuedScan[], results: FlushResult[]): FlushPlan {
  const byId = new Map(results.map(r => [r.id, r]))
  const plan: FlushPlan = { synced: [], retry: [], refused: [] }

  for (const scan of scans) {
    const result = byId.get(scan.id)
    if (!result || result.outcome === 'retry') plan.retry.push(scan)
    else if (result.outcome === 'synced') plan.synced.push(scan)
    else plan.refused.push({ scan, reason: result.reason })
  }

  return plan
}
