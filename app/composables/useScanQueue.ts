import { ref } from 'vue'
import { openDB, type IDBPDatabase } from 'idb'
import { ApiError, isOfflineError } from '@/lib/api'
import type { FlushResult, QueuedScan, RefusedScan } from '@/utils/scan-queue'

/**
 * The phone-side half of the offline scanner queue (plan §8.2). Scans live in
 * IndexedDB across app restarts, are sent in the order they were taken, and
 * refusals are parked with their reason so nothing disappears silently.
 */
const DB_NAME = 'usc-scanner-queue'
const PENDING = 'pending'
const REFUSED = 'refused'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : 'Could not record this scan'
}

export function useScanQueue() {
  const pending = ref<QueuedScan[]>([])
  const refused = ref<RefusedScan[]>([])
  const syncing = ref(false)
  const lastSyncedAt = ref('')
  const online = ref(true)

  let dbPromise: Promise<IDBPDatabase> | null = null

  function open(): Promise<IDBPDatabase> {
    if (!dbPromise) {
      dbPromise = openDB(DB_NAME, 1, {
        upgrade(database) {
          if (!database.objectStoreNames.contains(PENDING)) database.createObjectStore(PENDING, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(REFUSED)) database.createObjectStore(REFUSED, { keyPath: 'scan.id' })
        }
      })
    }
    return dbPromise
  }

  async function refresh() {
    const db = await open()
    pending.value = await db.getAll(PENDING)
    refused.value = await db.getAll(REFUSED)
  }

  async function enqueue(scan: QueuedScan) {
    const db = await open()
    await db.put(PENDING, scan)
    await refresh()
  }

  async function forget(scanId: string) {
    const db = await open()
    await db.delete(PENDING, scanId)
    await refresh()
  }

  async function clearRefused() {
    const db = await open()
    await db.clear(REFUSED)
    await refresh()
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

  return { pending, refused, syncing, lastSyncedAt, online, enqueue, forget, clearRefused, flush, refresh, startWatching }
}
