import { ref, onMounted, onUnmounted } from 'vue'
import { openDB, type IDBPDatabase } from 'idb'
import type { OfflineCheckIn, CheckInPayload } from '@/types'
import { api } from '@/lib/api'

const DB_NAME = 'usc-attendance'
const STORE_NAME = 'checkin-queue'

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
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
    queueLength.value = all.filter((i: OfflineCheckIn) => !i.synced).length
  }

  async function enqueue(payload: CheckInPayload) {
    const db = await getDB()
    const item: OfflineCheckIn = {
      ...payload,
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
    const all: OfflineCheckIn[] = await db.getAll(STORE_NAME)
    const pending = all.filter((i) => !i.synced)

    if (pending.length === 0) return

    syncing.value = true

    for (const item of pending) {
      try {
        await api.post('/attendance', {
          eventId: item.eventId,
          userId: item.userId,
          method: item.method,
          lat: item.lat,
          lng: item.lng,
          recordedBy: item.recordedBy,
        })
        await db.put(STORE_NAME, { ...item, synced: true })
      } catch {
        // Leave in queue for next attempt
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
