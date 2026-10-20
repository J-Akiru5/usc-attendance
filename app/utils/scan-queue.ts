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
  /**
   * The officer who took the scan (T-0008). Always written for a new scan; a
   * row queued before ownership was recorded has no value and is *parked*,
   * never sent and never attributed to whoever happens to be signed in next.
   */
  recordedBy?: string
  lat: number | null
  lng: number | null
  accuracy: number | null
  /** When the scan happened, not when it was sent. */
  scannedAt: string
  /**
   * One opaque key per scan, generated when the scan is taken (BC-5). Every
   * sync attempt reuses it, so the server can return the first record instead
   * of writing a second one after a lost response.
   */
  idempotencyKey?: string
  /** Why an officer recorded a manual entry by hand. Required for `manual`. */
  manualReason?: string
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
 * The key a queued scan presents to the server. New scans carry the key they
 * were given when taken; a row queued before BC-5 falls back to its local id,
 * which was also created once per scan and survives every retry. Either way a
 * retry is a replay, never a second check-in.
 */
export function scanIdempotencyKey(scan: Pick<QueuedScan, 'id' | 'idempotencyKey'>): string {
  const key = scan.idempotencyKey?.trim()
  return key ? key : scan.id
}

// ---------------------------------------------------------------------------
// Officer ownership (T-0008)
//
// A phone can be handed from one officer to another. The queue is per browser,
// so without an owner the second officer would sync the first officer's scans
// and the server would stamp them `recordedBy: <second officer>` - a wrong
// record no later audit can undo.
//
// The decision is pure so the scanner, the banner and the tests agree: the
// queue belongs to the officer recorded on it, a second officer is refused
// while that work exists, and rows with no owner at all are set aside instead
// of guessed.
// ---------------------------------------------------------------------------

export interface QueueOwnershipInput {
  /** The officer signed in on this device now. */
  officerId: string
  /** The owner stored when this device's queue was first claimed, if any. */
  queueOwnerId: string | null
  /** Everything currently in the pending store. */
  scans: readonly QueuedScan[]
}

export interface QueueOwnership {
  /** `foreign` means the current officer may neither send nor add to the queue. */
  state: 'mine' | 'foreign'
  /**
   * The officer the queue belongs to, when one can be determined. Internal
   * only: the officer-facing message never names another officer.
   */
  ownerId: string | null
  /** The scans the current officer may send. Empty while the queue is foreign. */
  pending: QueuedScan[]
  /**
   * Rows queued before ownership was recorded. They are preserved in the
   * parked store and never sent: they cannot be attributed honestly.
   */
  park: QueuedScan[]
  /** Convenience for the UI: `state === 'foreign'`. */
  locked: boolean
  /** Officer-facing explanation, or null when there is nothing to say. */
  message: string | null
}

function parkedMessage(count: number): string {
  const subject = count === 1 ? '1 unsynced scan was' : `${count} unsynced scans were`
  const pronoun = count === 1 ? 'It stays' : 'They stay'
  return `${subject} saved before this phone recorded an officer, so ${count === 1 ? 'it was' : 'they were'} set aside and not sent. ${pronoun} on this device.`
}

function withParkedNotice(message: string, parked: number): string | null {
  if (parked === 0) return message || null
  const notice = parkedMessage(parked)
  return message ? `${message} ${notice}` : notice
}

/**
 * Decides who the queue belongs to and what may be sent.
 *
 * - A queue with attributed rows from more than one officer is never sent: the
 *   device cannot know which of them is the owner, and picking one would
 *   misattribute the other's scans.
 * - A foreign queue with nothing left to send does not lock the next officer
 *   out forever; an empty queue is claimed by whoever signs in.
 * - Rows without a `recordedBy` are always parked, whoever is signed in.
 */
export function queueOwnership(input: QueueOwnershipInput): QueueOwnership {
  const unowned = input.scans.filter(scan => !scan.recordedBy)
  const attributed = input.scans.filter(scan => !!scan.recordedBy)
  const owners = new Set(attributed.map(scan => scan.recordedBy as string))
  if (input.queueOwnerId) owners.add(input.queueOwnerId)

  const base = { park: unowned, pending: attributed, locked: false }

  if (owners.size > 1) {
    return {
      ...base,
      state: 'foreign',
      ownerId: null,
      pending: [],
      locked: true,
      message: withParkedNotice(
        'This phone is holding unsynced scans from more than one officer. Nothing was sent. An administrator must review this queue.',
        unowned.length
      )
    }
  }

  const ownerId = [...owners][0] ?? null

  // No owner anywhere: everything present is unowned and parked. The current
  // officer may start a fresh queue on this phone.
  if (!ownerId) {
    return {
      ...base,
      state: 'mine',
      ownerId: input.officerId,
      pending: [],
      message: withParkedNotice('', unowned.length)
    }
  }

  if (ownerId !== input.officerId) {
    // A previous officer's queue with nothing left to send is not a reason to
    // lock the phone forever; claim the device for the officer signed in now.
    if (attributed.length === 0) {
      return {
        ...base,
        state: 'mine',
        ownerId: input.officerId,
        pending: [],
        message: withParkedNotice('', unowned.length)
      }
    }

    return {
      ...base,
      state: 'foreign',
      ownerId,
      pending: [],
      locked: true,
      message: withParkedNotice(
        'This phone is holding unsynced scans taken by a different officer. Nothing was sent. Sign back in as that officer to sync them.',
        unowned.length
      )
    }
  }

  return {
    ...base,
    state: 'mine',
    ownerId,
    message: withParkedNotice('', unowned.length)
  }
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

// ---------------------------------------------------------------------------
// Durability decisions (BC-6)
//
// IndexedDB is best-effort: a browser may evict it under storage pressure and
// Safari deletes script-written storage after roughly seven days without
// interaction. Every decision that protects an officer's queued scans is a
// pure function here so the scanner page, the dashboard banner and the unit
// tests cannot disagree about it.
// ---------------------------------------------------------------------------

/** Hard ceiling per phone. 500 scans is a full morning at a busy door. */
export const MAX_PENDING_SCANS = 500

export interface QueueCapacity {
  /** Whether the scan may be written to the queue. */
  allowed: boolean
  /** How many scans were already queued when the decision was made. */
  count: number
  /** How many more scans fit before the cap. */
  remaining: number
  /** True when the queue has reached the hard cap. */
  atCap: boolean
  /** Loud, officer-facing explanation when the scan must be refused. */
  message: string | null
}

/**
 * Guards the queue against growing without bound. A phone that cannot sync
 * must not quietly accept an endless morning of scans; at the cap the officer
 * is told plainly to sync before scanning anyone else.
 */
export function canQueueScan(pendingCount: number, cap = MAX_PENDING_SCANS): QueueCapacity {
  const count = Number.isFinite(pendingCount) ? Math.max(0, Math.floor(pendingCount)) : 0
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : MAX_PENDING_SCANS
  const allowed = count < limit

  return {
    allowed,
    count,
    remaining: Math.max(0, limit - count),
    atCap: !allowed,
    message: allowed
      ? null
      : `This phone is holding ${limit} unsynced scans — the maximum. Sync now; new scans are not being saved.`
  }
}

export interface UnsyncedBannerInput {
  pending: number
  /** Refusals the officer has not acknowledged yet - not the whole list. */
  notRecorded: number
  /**
   * The recorded `navigator.storage.persist()` outcome. `null` means the
   * question has not been asked (or the browser cannot answer it), so the
   * banner must not claim the phone is unsafe.
   */
  persisted?: boolean | null
  /**
   * True while the pending queue belongs to another officer (T-0008). The
   * banner still says work is waiting, but says plainly that this account
   * cannot send it - without naming the other officer.
   */
  foreignOwner?: boolean
}

export interface UnsyncedBannerState {
  visible: boolean
  pending: number
  notRecorded: number
  /** Short line for the persistent banner: "2 unsynced scans". */
  label: string
  tone: 'warning' | 'danger'
  atCap: boolean
  /** Present only when queued work is at risk. */
  storageWarning: string | null
}

/**
 * The persistent officer-wide banner. It stays visible while **either** unsent
 * scans or unacknowledged refusals remain, and never while the queue is clear —
 * so its count is the truth an officer can act on after a reload.
 */
export function unsyncedBanner(input: UnsyncedBannerInput): UnsyncedBannerState {
  const pending = Number.isFinite(input.pending) ? Math.max(0, Math.floor(input.pending)) : 0
  const notRecorded = Number.isFinite(input.notRecorded) ? Math.max(0, Math.floor(input.notRecorded)) : 0
  const persisted = input.persisted ?? null
  const foreignOwner = input.foreignOwner === true
  const atCap = pending >= MAX_PENDING_SCANS
  const parts: string[] = []

  if (pending > 0) {
    const count = `${pending} unsynced scan${pending === 1 ? '' : 's'}`
    parts.push(foreignOwner ? `${count} from another officer` : count)
  }
  if (notRecorded > 0) parts.push(`${notRecorded} not recorded`)

  return {
    visible: pending > 0 || notRecorded > 0,
    pending,
    notRecorded,
    label: parts.join(' · '),
    tone: atCap || foreignOwner || notRecorded > 0 || (pending > 0 && persisted === false) ? 'danger' : 'warning',
    atCap,
    storageWarning: pending > 0 && persisted === false
      ? 'This phone may discard unsynced scans — sync before leaving.'
      : null
  }
}

/** Refusals whose rows have not been acknowledged since they were parked. */
export function unacknowledgedRefusals(refused: readonly RefusedScan[], acknowledged: readonly string[]): RefusedScan[] {
  const seen = new Set(acknowledged)
  return refused.filter(row => !seen.has(row.scan.id))
}

/** True when there is a parked-refusal list and every row on it was acknowledged. */
export function refusalsAcknowledged(refused: readonly RefusedScan[], acknowledged: readonly string[]): boolean {
  return refused.length > 0 && unacknowledgedRefusals(refused, acknowledged).length === 0
}

/** The ids to persist when the officer acknowledges the current list. */
export function acknowledgementIds(refused: readonly RefusedScan[]): string[] {
  return [...new Set(refused.map(row => row.scan.id))]
}

export interface StorageReading {
  /** `navigator.storage.persist()` / `persisted()` result; null when unknown. */
  persisted: boolean | null
  /** `navigator.storage.estimate().quota`, in bytes. */
  quota: number | null
  /** `navigator.storage.estimate().usage`, in bytes. */
  usage: number | null
}

export type StorageLevel = 'ok' | 'watch' | 'critical' | 'unknown'

export interface StorageAdvice {
  level: StorageLevel
  /** True only when the persist() request was actually answered "no". */
  persistRefused: boolean
  lowSpace: boolean
  freeBytes: number | null
  freeLabel: string | null
  /** Officer-facing sentence, or null when there is nothing to say. */
  message: string | null
}

/** Below this the browser may start evicting; sync is urgent. */
export const LOW_FREE_BYTES = 10 * 1024 * 1024
/** Or below this share of the origin's quota. */
export const LOW_FREE_RATIO = 0.05
/** Below this it is worth warning before it becomes urgent. */
export const WATCH_FREE_BYTES = 50 * 1024 * 1024
export const WATCH_FREE_RATIO = 0.15

function byteCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** Human bytes for the storage warning ("8.4 MB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown'
  if (bytes < 1024) return `${Math.round(bytes)} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/**
 * Turns the raw storage facts into one decision: whether to nudge the officer,
 * whether persistence was refused, and how much room is honestly left. Free
 * space is only mentioned when it is genuinely low, so the notice does not
 * become background noise.
 */
export function storageAdvice(reading: StorageReading): StorageAdvice {
  const quota = byteCount(reading.quota)
  const usage = byteCount(reading.usage)
  const freeBytes = quota !== null && usage !== null ? Math.max(0, quota - usage) : null
  const freeRatio = freeBytes !== null && quota !== null && quota > 0 ? freeBytes / quota : null
  const lowSpace = freeBytes !== null
    && (freeBytes <= LOW_FREE_BYTES || (freeRatio !== null && freeRatio <= LOW_FREE_RATIO))
  const watchSpace = !lowSpace
    && freeBytes !== null
    && (freeBytes <= WATCH_FREE_BYTES || (freeRatio !== null && freeRatio <= WATCH_FREE_RATIO))
  const persistRefused = reading.persisted === false
  const persistUnknown = reading.persisted === null
  const freeLabel = freeBytes !== null ? formatBytes(freeBytes) : null

  let level: StorageLevel = 'ok'
  if (lowSpace) level = 'critical'
  else if (watchSpace || persistRefused) level = 'watch'
  else if (persistUnknown) level = 'unknown'

  let message: string | null = null
  if (lowSpace) {
    message = `Only ${freeLabel} free on this phone — sync now. The browser can discard queued scans when storage fills.`
  } else if (watchSpace) {
    message = `Storage is getting low — ${freeLabel} free. Sync soon so a full phone cannot discard queued scans.`
  } else if (persistRefused) {
    message = 'Storage protection was refused — this phone may discard unsynced scans.'
  } else if (persistUnknown) {
    message = 'This browser cannot confirm that queued scans are protected. Keep this page open until they sync.'
  }

  return { level, persistRefused, lowSpace, freeBytes, freeLabel, message }
}
