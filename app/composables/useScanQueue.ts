import { ref } from 'vue'
import { openDB, type IDBPDatabase } from 'idb'
import { ApiError, isOfflineError } from '@/lib/api'
import { acknowledgementIds, canQueueScan, queueOwnership } from '@/utils/scan-queue'
import type { FlushResult, QueuedScan, QueueCapacity, QueueOwnership, RefusedScan, StorageReading } from '@/utils/scan-queue'

/**
 * The phone-side half of the offline scanner queue (plan §8.2). Scans live in
 * IndexedDB across app restarts, are sent in the order they were taken, and
 * refusals are parked with their reason so nothing disappears silently.
 *
 * T-0008: the queue is bound to the officer who took the scans. A handover
 * between officers on the same phone must never attribute the first officer's
 * scans to the second, so `claim()` is called before enqueueing and before
 * syncing, and a foreign queue is left untouched. Rows written before ownership
 * existed are moved to a `parked` store, never sent.
 *
 * BC-6: IndexedDB is best-effort. The queue therefore records whether the
 * browser granted persistent storage, keeps that outcome (and the officer's
 * acknowledgement of the refusal list) in the same database, and exposes the
 * counts to the dashboard banner. Counts live in `useState` so the layout and
 * the scanner page read one truth; nothing here runs during SSR.
 */
const DB_NAME = 'usc-scanner-queue'
const DB_VERSION = 3
const PENDING = 'pending'
const REFUSED = 'refused'
const PARKED = 'parked'
const META = 'meta'
const REFUSAL_ACK_KEY = 'refused-ack'
const STORAGE_KEY = 'storage'
const OWNER_KEY = 'owner'

interface MetaRow<T> {
  key: string
  value: T
}

interface RefusalAck {
  acknowledged: string[]
  at: string
}

export interface ScanStorageState extends StorageReading {
  /** True once `persist()` was actually asked (the answer is in `persisted`). */
  requested: boolean
  checkedAt: string
}

export type FlushOutcome
  = | { outcome: 'synced' }
    | { outcome: 'empty' }
    | { outcome: 'busy' }
    | { outcome: 'throttled' }
    | { outcome: 'locked', message: string }

let dbPromise: Promise<IDBPDatabase> | null = null

function open(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(PENDING)) database.createObjectStore(PENDING, { keyPath: 'id' })
        if (!database.objectStoreNames.contains(REFUSED)) database.createObjectStore(REFUSED, { keyPath: 'scan.id' })
        if (!database.objectStoreNames.contains(META)) database.createObjectStore(META, { keyPath: 'key' })
        // T-0008: rows that cannot be attributed are preserved here, out of the
        // sync path, instead of being sent under the wrong officer.
        if (!database.objectStoreNames.contains(PARKED)) database.createObjectStore(PARKED, { keyPath: 'id' })
      }
    }).catch((error) => {
      // Do not cache a failed open forever (blocked upgrade, private mode):
      // the next attempt deserves a fresh connection.
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : 'Could not record this scan'
}

/**
 * A throttled scan was not judged: the budget window has not rolled over yet.
 * It is retried with the rest of the queue instead of being parked as a refusal.
 */
function isThrottled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429
}

export function useScanQueue() {
  const pending = useState<QueuedScan[]>('scan-queue:pending', () => [])
  const refused = useState<RefusedScan[]>('scan-queue:refused', () => [])
  const parked = useState<QueuedScan[]>('scan-queue:parked', () => [])
  const acknowledgedIds = useState<string[]>('scan-queue:acknowledged', () => [])
  const storage = useState<ScanStorageState | null>('scan-queue:storage', () => null)
  const ownerId = useState<string | null>('scan-queue:owner', () => null)
  const ownership = useState<'unknown' | 'mine' | 'foreign'>('scan-queue:ownership', () => 'unknown')
  const ownershipMessage = useState<string | null>('scan-queue:ownership-message', () => null)
  const syncing = ref(false)
  const lastSyncedAt = ref('')
  const online = ref(true)

  async function refresh() {
    const db = await open()
    const allRefused = await db.getAll(REFUSED)
    pending.value = await db.getAll(PENDING)
    parked.value = await db.getAll(PARKED)

    const ack = await db.get(META, REFUSAL_ACK_KEY) as MetaRow<RefusalAck> | undefined
    acknowledgedIds.value = ack?.value.acknowledged ?? []

    const stored = await db.get(META, STORAGE_KEY) as MetaRow<ScanStorageState> | undefined
    if (stored?.value) storage.value = stored.value

    const owner = await db.get(META, OWNER_KEY) as MetaRow<string> | undefined
    ownerId.value = owner?.value ?? null

    // Refusals name the student and the reason, so they are as owner-bound as
    // the pending queue. A foreign officer sees none of them; rows from before
    // ownership existed have no owner to show them under and stay on disk.
    refused.value = ownership.value === 'mine'
      ? allRefused.filter(row => !!row.scan.recordedBy && row.scan.recordedBy === ownerId.value)
      : []
  }

  /**
   * Resolves who this device's queue belongs to (T-0008). Safe to call on every
   * page mount and before every send: it only mutates the database to move
   * ownerless rows into `parked` and to record the owner when the queue is the
   * current officer's.
   */
  async function claim(officer: string): Promise<QueueOwnership> {
    const db = await open()
    const scans = await db.getAll(PENDING)
    const stored = await db.get(META, OWNER_KEY) as MetaRow<string> | undefined
    const decision = queueOwnership({
      officerId: officer,
      queueOwnerId: stored?.value ?? null,
      scans
    })
    // Set the state before refreshing: `refresh` only surfaces refusals to
    // their owner, and this is the moment ownership becomes known.
    ownership.value = decision.state

    if (decision.park.length > 0) {
      const tx = db.transaction([PENDING, PARKED], 'readwrite')
      const pendingStore = tx.objectStore(PENDING)
      const parkedStore = tx.objectStore(PARKED)
      for (const scan of decision.park) {
        await parkedStore.put(scan)
        await pendingStore.delete(scan.id)
      }
      await tx.done
    }

    if (decision.state === 'mine' && decision.ownerId && stored?.value !== decision.ownerId) {
      await db.put(META, { key: OWNER_KEY, value: decision.ownerId })
    }

    await refresh()
    ownershipMessage.value = decision.message
    ownerId.value = decision.state === 'mine' ? decision.ownerId : (stored?.value ?? decision.ownerId)
    return decision
  }

  /**
   * Writes a scan only when the queue is below the hard cap and belongs to this
   * officer. The decision is taken against the database count, not a stale
   * in-memory number, so two tabs cannot both slip a scan in at 499.
   */
  async function enqueue(scan: QueuedScan, officer: string): Promise<QueueCapacity> {
    const decision = await claim(officer)
    const db = await open()

    if (decision.state !== 'mine') {
      return {
        allowed: false,
        count: await db.count(PENDING),
        remaining: 0,
        atCap: false,
        message: decision.message ?? 'This phone is holding scans from another officer. Nothing was saved.'
      }
    }

    if (scan.recordedBy && scan.recordedBy !== officer) {
      return {
        allowed: false,
        count: await db.count(PENDING),
        remaining: 0,
        atCap: false,
        message: 'This scan was taken by a different officer, so it cannot be saved under this account.'
      }
    }

    const capacity = canQueueScan(await db.count(PENDING))
    if (!capacity.allowed) {
      pending.value = await db.getAll(PENDING)
      return capacity
    }

    await db.put(PENDING, { ...scan, recordedBy: officer })
    await refresh()
    return capacity
  }

  async function forget(scanId: string) {
    const db = await open()
    await db.delete(PENDING, scanId)
    await refresh()
  }

  /**
   * Persists the acknowledgement, not just a component flag: after a reload
   * the same refusals must still count as acknowledged, while a refusal that
   * arrives later does not.
   */
  async function acknowledgeRefused() {
    const acknowledged = acknowledgementIds(refused.value)
    if (acknowledged.length === 0) return

    const db = await open()
    await db.put(META, {
      key: REFUSAL_ACK_KEY,
      value: { acknowledged, at: new Date().toISOString() } satisfies RefusalAck
    })
    acknowledgedIds.value = acknowledged
  }

  /**
   * Records what the browser says about storage. `request` is only true just
   * before the first queued scan, so the officer is never prompted on a page
   * that has nothing to protect; the answer is written to IndexedDB so a
   * refused persistence request stays visible across reloads.
   */
  async function refreshStorage(request = false) {
    const previous = storage.value
    let persisted: boolean | null = null
    let quota: number | null = null
    let usage: number | null = null

    if (typeof navigator !== 'undefined' && navigator.storage) {
      try {
        if (typeof navigator.storage.persisted === 'function') persisted = await navigator.storage.persisted()
        if (request && persisted !== true && typeof navigator.storage.persist === 'function') {
          persisted = await navigator.storage.persist()
        }
      } catch {
        // Unsupported or blocked: a refused request must still be recorded.
        if (request) persisted = false
      }

      try {
        const estimate = await navigator.storage.estimate()
        quota = typeof estimate.quota === 'number' ? estimate.quota : null
        usage = typeof estimate.usage === 'number' ? estimate.usage : null
      } catch {
        // Estimation is best-effort; the queue itself is unaffected.
      }
    }

    const next: ScanStorageState = {
      persisted,
      quota,
      usage,
      requested: previous?.requested === true || request,
      checkedAt: new Date().toISOString()
    }
    storage.value = next

    const db = await open()
    await db.put(META, { key: STORAGE_KEY, value: next })
  }

  /**
   * Sends what is queued, in scan order, and stops at the first sign that the
   * connection is still down (the rest waits for the next attempt).
   *
   * A 429 is the server's scan budget, not a judgement on the scan: the row is
   * kept for the next window rather than parked as refused. A foreign queue is
   * never read from this account, and nothing is sent.
   */
  async function flush(send: (scan: QueuedScan) => Promise<unknown>, officer: string): Promise<FlushOutcome> {
    if (syncing.value) return { outcome: 'busy' }

    const decision = await claim(officer)
    if (decision.state !== 'mine') {
      return { outcome: 'locked', message: decision.message ?? 'This phone is holding scans from another officer.' }
    }
    if (decision.pending.length === 0) {
      await refresh()
      return { outcome: 'empty' }
    }

    syncing.value = true
    let throttled = false

    try {
      const results: FlushResult[] = []
      for (const scan of decision.pending) {
        try {
          await send(scan)
          results.push({ id: scan.id, outcome: 'synced' })
        } catch (error) {
          if (isOfflineError(error)) {
            results.push({ id: scan.id, outcome: 'retry' })
            break
          }
          if (isThrottled(error)) {
            results.push({ id: scan.id, outcome: 'retry' })
            throttled = true
            break
          }
          results.push({ id: scan.id, outcome: 'refused', reason: errorMessage(error) })
        }
      }

      const db = await open()
      const at = new Date().toISOString()
      for (const result of results) {
        if (result.outcome === 'synced') {
          await db.delete(PENDING, result.id)
          lastSyncedAt.value = at
        } else if (result.outcome === 'refused') {
          const scan = decision.pending.find(s => s.id === result.id)
          if (scan) {
            await db.put(REFUSED, { scan, reason: result.reason, at })
            await db.delete(PENDING, result.id)
          }
        }
      }
      await refresh()
    } finally {
      syncing.value = false
    }

    return throttled ? { outcome: 'throttled' } : { outcome: 'synced' }
  }

  function startWatching(onOnline: () => void) {
    if (typeof window === 'undefined') return () => {}
    const markOnline = () => {
      online.value = true
      onOnline()
    }
    const markOffline = () => {
      online.value = false
    }
    online.value = window.navigator.onLine
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }

  return {
    pending,
    refused,
    parked,
    acknowledgedIds,
    storage,
    ownerId,
    ownership,
    ownershipMessage,
    syncing,
    lastSyncedAt,
    online,
    enqueue,
    forget,
    acknowledgeRefused,
    refresh,
    refreshStorage,
    claim,
    flush,
    startWatching
  }
}
