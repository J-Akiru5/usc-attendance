import { ref } from 'vue'
import { openDB, type IDBPDatabase } from 'idb'
import { ApiError, isOfflineError } from '@/lib/api'
import { acknowledgementIds, canQueueScan } from '@/utils/scan-queue'
import type { FlushResult, QueuedScan, QueueCapacity, RefusedScan, StorageReading } from '@/utils/scan-queue'

/**
 * The phone-side half of the offline scanner queue (plan §8.2). Scans live in
 * IndexedDB across app restarts, are sent in the order they were taken, and
 * refusals are parked with their reason so nothing disappears silently.
 *
 * BC-6: IndexedDB is best-effort. The queue therefore records whether the
 * browser granted persistent storage, keeps that outcome (and the officer's
 * acknowledgement of the refusal list) in the same database, and exposes the
 * counts to the dashboard banner. Counts live in `useState` so the layout and
 * the scanner page read one truth; nothing here runs during SSR.
 */
const DB_NAME = 'usc-scanner-queue'
const DB_VERSION = 2
const PENDING = 'pending'
const REFUSED = 'refused'
const META = 'meta'
const REFUSAL_ACK_KEY = 'refused-ack'
const STORAGE_KEY = 'storage'

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

let dbPromise: Promise<IDBPDatabase> | null = null

function open(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(PENDING)) database.createObjectStore(PENDING, { keyPath: 'id' })
        if (!database.objectStoreNames.contains(REFUSED)) database.createObjectStore(REFUSED, { keyPath: 'scan.id' })
        if (!database.objectStoreNames.contains(META)) database.createObjectStore(META, { keyPath: 'key' })
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

export function useScanQueue() {
  const pending = useState<QueuedScan[]>('scan-queue:pending', () => [])
  const refused = useState<RefusedScan[]>('scan-queue:refused', () => [])
  const acknowledgedIds = useState<string[]>('scan-queue:acknowledged', () => [])
  const storage = useState<ScanStorageState | null>('scan-queue:storage', () => null)
  const syncing = ref(false)
  const lastSyncedAt = ref('')
  const online = ref(true)

  async function refresh() {
    const db = await open()
    pending.value = await db.getAll(PENDING)
    refused.value = await db.getAll(REFUSED)

    const ack = await db.get(META, REFUSAL_ACK_KEY) as MetaRow<RefusalAck> | undefined
    acknowledgedIds.value = ack?.value.acknowledged ?? []

    const stored = await db.get(META, STORAGE_KEY) as MetaRow<ScanStorageState> | undefined
    if (stored?.value) storage.value = stored.value
  }

  /**
   * Writes a scan only when the queue is below the hard cap. The decision is
   * taken against the database count, not a stale in-memory number, so two
   * tabs cannot both slip a scan in at 499.
   */
  async function enqueue(scan: QueuedScan): Promise<QueueCapacity> {
    const db = await open()
    const capacity = canQueueScan(await db.count(PENDING))
    if (!capacity.allowed) {
      pending.value = await db.getAll(PENDING)
      return capacity
    }

    await db.put(PENDING, scan)
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
   */
  async function flush(send: (scan: QueuedScan) => Promise<unknown>) {
    if (syncing.value || pending.value.length === 0) return
    syncing.value = true

    try {
      const results: FlushResult[] = []
      for (const scan of pending.value) {
        try {
          await send(scan)
          results.push({ id: scan.id, outcome: 'synced' })
        } catch (error) {
          if (isOfflineError(error)) {
            results.push({ id: scan.id, outcome: 'retry' })
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
          const scan = pending.value.find(s => s.id === result.id)
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
    acknowledgedIds,
    storage,
    syncing,
    lastSyncedAt,
    online,
    enqueue,
    forget,
    acknowledgeRefused,
    refresh,
    refreshStorage,
    flush,
    startWatching
  }
}
