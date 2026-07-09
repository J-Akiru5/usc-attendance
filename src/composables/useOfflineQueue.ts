import { ref, onMounted, onUnmounted } from 'vue'
import { openDB, type IDBPDatabase } from 'idb'
import type { CheckInPayload } from '@/types'
import { api } from '@/lib/api'

const DB_NAME = 'usc-attendance'
const STORE_NAME = 'checkin-queue'

export interface OfflineQueueItem extends Omit<CheckInPayload, 'type'> {
  id: string
  queueType: 'checkin' | 'checkout'
  synced: boolean
  createdAt: string
}

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    },
  })
}

export function useOfflineQueue() {
  const queueLength = ref(0)
  const syncing = ref(false)
  let onlineHandler: (() => void) | null = null

  async function updateQueueLength() {
    const db = await getDB()
    const all = await db.getAll(STORE_NAME)
    queueLength.value = all.filter((i: OfflineQueueItem) => !i.synced).length
  }

  async function enqueue(payload: Omit<CheckInPayload, 'type'>, queueType: 'checkin' | 'checkout' = 'checkin') {
    const db = await getDB()
    const item: OfflineQueueItem = {
      ...payload,
      queueType,
      id: crypto.randomUUID(),
      synced: false,
      createdAt: new Date().toISOString(),
    }
    await db.add(STORE_NAME, item)
    await updateQueueLength()
    return item
  }

  async function flushQueue() {
    if (syncing.value) return

    const db = await getDB()
    const all: OfflineQueueItem[] = await db.getAll(STORE_NAME)
    const pending = all.filter((i) => !i.synced)

    if (pending.length === 0) return

    syncing.value = true

    // Process in FIFO order — retries for failed checkouts happen after their
    // matching check-in has synced, so keeping order is critical.
    for (const item of pending) {
      try {
        if (item.queueType === 'checkout') {
          await api.post('/attendance/checkout', {
            eventId: item.eventId,
            userId: item.userId,
            dutyDate: !item.eventId ? new Date().toISOString() : undefined,
          })
          await db.put(STORE_NAME, { ...item, synced: true })
        } else {
          await api.post('/attendance', {
            eventId: item.eventId,
            userId: item.userId,
            method: item.method,
            lat: item.lat,
            lng: item.lng,
            recordedBy: item.recordedBy,
          })
          await db.put(STORE_NAME, { ...item, synced: true })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : ''

        // 404 on checkout = matching check-in hasn't synced yet — re-queue for next flush
        if (item.queueType === 'checkout' && msg.includes('404')) {
          continue
        }

        // Time-window rejection (403) or other permanent failure — mark synced to stop retries
        if (msg.includes('403') || msg.includes('only allowed')) {
          await db.put(STORE_NAME, { ...item, synced: true })
          continue
        }

        // Other transient errors — leave in queue for next attempt
      }
    }

    syncing.value = false
    await updateQueueLength()
  }

  function onOnline() {
    flushQueue()
  }

  onMounted(() => {
    updateQueueLength()
    onlineHandler = onOnline
    window.addEventListener('online', onlineHandler)
  })

  onUnmounted(() => {
    if (onlineHandler) {
      window.removeEventListener('online', onlineHandler)
    }
  })

  return {
    queueLength,
    syncing,
    enqueue,
    flushQueue,
    updateQueueLength,
  }
}
