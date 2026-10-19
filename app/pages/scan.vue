<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { api, isOfflineError } from '@/lib/api'
import { useGeolocation } from '@/composables/useGeolocation'
import { useScanQueue } from '@/composables/useScanQueue'
import { classifyScan, findExactStudent } from '@/utils/scan'
import { canQueueScan, storageAdvice, unacknowledgedRefusals } from '@/utils/scan-queue'
import type { QueuedScan } from '@/utils/scan-queue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'], allowDelegates: true })

interface EventOption { id: string, title: string, date: string }
interface LookupStudent { id: string, name: string, studentNo: string | null, yearLevel: number | null, section: string | null }

const route = useRoute()
const router = useRouter()
const geo = useGeolocation()
const {
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
  flush,
  refresh,
  refreshStorage,
  startWatching
} = useScanQueue()

const events = ref<EventOption[]>([])
const eventId = ref(typeof route.query.eventId === 'string' ? route.query.eventId : '')
const selectedEvent = computed(() => events.value.find(e => e.id === eventId.value) ?? null)

// BC-6 decisions (pure, unit-tested in `app/utils/scan-queue.ts`).
const capacity = computed(() => canQueueScan(pending.value.length))
const unacknowledged = computed(() => unacknowledgedRefusals(refused.value, acknowledgedIds.value))
const storageState = computed(() => {
  const reading = storage.value
  // `persisted: false` is only "refused" once persist() actually answered.
  const persisted = reading?.persisted === true ? true : reading?.requested ? false : null
  return storageAdvice({ persisted, quota: reading?.quota ?? null, usage: reading?.usage ?? null })
})
const showStorageNotice = computed(() => !!storage.value?.requested || storageState.value.lowSpace)

const scanning = ref(false)
const result = ref<{ kind: 'ok' | 'warn' | 'error', message: string } | null>(null)
const candidates = ref<LookupStudent[]>([])
const scannerRef = ref<HTMLDivElement | null>(null)
let html5QrScanner: import('html5-qrcode').Html5Qrcode | null = null

// A camera fires the same code many times a second; one scan per two seconds is
// plenty and keeps a queue from forming.
const cooldownUntil = ref(0)
const SCAN_COOLDOWN_MS = 2000
let stopWatching: (() => void) | undefined

async function position(): Promise<{ lat: number | null, lng: number | null, accuracy: number | null }> {
  try {
    let lat = geo.latitude.value
    let lng = geo.longitude.value
    if (lat === null || lng === null) {
      const here = await geo.getPosition()
      lat = here.lat
      lng = here.lng
    }
    return { lat, lng, accuracy: geo.accuracy.value }
  } catch {
    // No fix (indoors, no permission): record what we can and let the server judge.
    return { lat: null, lng: null, accuracy: null }
  }
}

function say(kind: 'ok' | 'warn' | 'error', message: string) {
  result.value = { kind, message }
}

/**
 * Sends a queued scan — the offline queue's half of the contract: the moment it
 * was taken travels with it, and the server judges it as of that moment (§8.2).
 */
async function sendQueued(scan: QueuedScan) {
  if (scan.kind === 'qr' && scan.token) {
    await api.post('/attendance/qr', {
      token: scan.token,
      lat: scan.lat,
      lng: scan.lng,
      accuracy: scan.accuracy,
      scannedAt: scan.scannedAt
    })
    return
  }

  await api.post('/attendance', {
    type: 'event',
    eventId: scan.eventId,
    userId: scan.userId,
    method: scan.kind === 'barcode' ? 'barcode' : 'manual',
    lat: scan.lat,
    lng: scan.lng,
    accuracy: scan.accuracy,
    scannedAt: scan.scannedAt
  })
}

async function syncNow() {
  await flush(sendQueued)
  if (pending.value.length === 0 && refused.value.length === 0) say('ok', 'Everything is synced.')
}

async function queueOffline(scan: Omit<QueuedScan, 'id' | 'scannedAt'>) {
  // Refuse loudly at the hard cap rather than growing an unrecoverable queue.
  const room = canQueueScan(pending.value.length)
  if (!room.allowed) {
    say('error', room.message ?? 'This phone is full of unsynced scans. Sync before scanning more.')
    return
  }

  // Before the first queued scan, ask the browser to protect this origin's
  // storage and record the answer. Later scans only refresh the estimate.
  if (!storage.value?.requested) await refreshStorage(true)
  else await refreshStorage(false)

  const stored = await enqueue({ ...scan, id: crypto.randomUUID(), scannedAt: new Date().toISOString() })
  if (!stored.allowed) {
    say('error', stored.message ?? 'This phone is full of unsynced scans. Sync before scanning more.')
    return
  }
  say('warn', 'No signal — saved on this phone and sent automatically when the connection is back.')
}

/** Sign in a student by their ID — QR token or the number off an ID barcode. */
async function record(userId: string, method: 'manual' | 'barcode', name: string) {
  const pos = await position()
  try {
    const row = await api.post<{ user?: { name?: string } }>('/attendance', {
      type: 'event',
      eventId: eventId.value,
      userId,
      method,
      lat: pos.lat,
      lng: pos.lng,
      accuracy: pos.accuracy
    })
    candidates.value = []
    say('ok', `${method === 'barcode' ? 'ID scanned — check-in recorded' : 'Check-in recorded'} for ${row.user?.name ?? name}`)
  } catch (error) {
    if (!isOfflineError(error)) throw error
    candidates.value = []
    await queueOffline({
      kind: method === 'barcode' ? 'barcode' : 'manual',
      eventId: eventId.value,
      label: name,
      userId,
      ...pos
    })
  }
}

async function lookup(q: string) {
  return api.get<{ query: string, exact: string | null, students: LookupStudent[] }>(
    `/events/${eventId.value}/student-lookup?q=${encodeURIComponent(q)}`
  )
}

async function scanQr(token: string) {
  const pos = await position()
  try {
    const response = await api.post<{ user?: { name?: string } }>('/attendance/qr', {
      token: token.trim(),
      lat: pos.lat,
      lng: pos.lng,
      accuracy: pos.accuracy
    })
    say('ok', `Check-in recorded for ${response.user?.name ?? 'the student'}`)
  } catch (error) {
    if (!isOfflineError(error)) throw error
    await queueOffline({
      kind: 'qr',
      eventId: eventId.value,
      label: 'QR code',
      token: token.trim(),
      ...pos
    })
  }
}

async function handleScan(decodedText: string) {
  if (Date.now() < cooldownUntil.value) return
  cooldownUntil.value = Date.now() + SCAN_COOLDOWN_MS

  scanning.value = true
  result.value = null

  try {
    // A signed token is handled outright; a student number needs the event
    // context, so the officer picks one first (plan §8.2).
    if (classifyScan(decodedText) === 'qr') {
      await scanQr(decodedText)
      return
    }

    if (!eventId.value) {
      say('warn', 'Pick the event above first — then the ID can be scanned.')
      return
    }

    const found = await lookup(decodedText.trim())
    const exact = found.students.find(s => s.id === found.exact)
    if (exact) {
      await record(exact.id, 'barcode', exact.name)
      return
    }

    if (found.students.length > 0) {
      candidates.value = found.students
      say('warn', `No exact student number match for “${found.query}” — pick the right person below.`)
      return
    }

    // Nothing matched as a number; it may still be a token the classifier found odd.
    await scanQr(decodedText)
  } catch (err: unknown) {
    say('error', err instanceof Error ? err.message : 'Scan failed')
  } finally {
    scanning.value = false
  }
}

// --- Manual fallback: type a student number or a name -----------------------
const manualQuery = ref('')
const manualBusy = ref(false)
const manualResults = ref<LookupStudent[]>([])
const manualMessage = ref('')

async function handleManualSearch() {
  if (!eventId.value) {
    manualMessage.value = 'Pick the event first.'
    return
  }
  const q = manualQuery.value.trim()
  if (q.length < 2) {
    manualMessage.value = 'Type at least two characters.'
    return
  }

  manualBusy.value = true
  manualMessage.value = ''
  manualResults.value = []
  try {
    const found = await lookup(q)
    const exact = findExactStudent(found.students, q)
    if (exact) {
      await record(exact.id, 'manual', exact.name)
      manualQuery.value = ''
      manualMessage.value = ''
      return
    }
    manualResults.value = found.students
    manualMessage.value = found.students.length === 0 ? 'No student matched that number or name.' : 'Pick the right person to record them.'
  } catch (err: unknown) {
    manualMessage.value = err instanceof Error ? err.message : 'Search failed'
  } finally {
    manualBusy.value = false
  }
}

async function recordFromList(student: LookupStudent) {
  manualBusy.value = true
  try {
    await record(student.id, 'manual', student.name)
    manualResults.value = []
    manualQuery.value = ''
    manualMessage.value = ''
  } catch (err: unknown) {
    manualMessage.value = err instanceof Error ? err.message : 'Could not record that student'
  } finally {
    manualBusy.value = false
  }
}

// --- Refuse to abandon queued work silently (BC-6) --------------------------
function pendingWarning(): string | null {
  if (pending.value.length === 0) return null
  const count = pending.value.length
  return `You still have ${count} unsynced scan${count === 1 ? '' : 's'} on this phone. They stay queued and sync when the connection is back.`
}

onBeforeRouteLeave(() => {
  const warning = pendingWarning()
  return warning ? window.confirm(warning) : true
})

onMounted(async () => {
  geo.startWatching()

  await refresh()
  await refreshStorage()
  stopWatching = startWatching(() => {
    void flush(sendQueued)
  })
  if (online.value && pending.value.length > 0) void flush(sendQueued)

  try {
    const list = await api.get<EventOption[]>('/events')
    const today = new Date().toISOString().slice(0, 10)
    events.value = list
      .filter(e => e.date.slice(0, 10) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    // Without the list the officer can still open the scanner from an event page.
  }

  try {
    const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')

    // D-03: iOS officers do QR-only duty. Reading 1D barcodes on iOS Safari leans
    // on a polyfill we cannot verify from here, so the supported split is QR
    // everywhere and ID barcodes on Chromium — with the number search below as
    // the fallback on any phone.
    const isAppleMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const formats = [
      Html5QrcodeSupportedFormats.QR_CODE,
      ...(isAppleMobile
        ? []
        : [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E
          ])
    ]

    if (scannerRef.value) {
      html5QrScanner = new Html5Qrcode('qr-scanner', {
        verbose: false,
        formatsToSupport: formats
      })
      await html5QrScanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText: string) => {
          handleScan(decodedText)
        },
        () => {} // ignore errors
      )
    }
  } catch {
    say('error', 'Camera access required for scanning')
  }
})

onUnmounted(() => {
  stopWatching?.()
  if (html5QrScanner) {
    html5QrScanner.stop().catch(() => {})
    html5QrScanner.clear()
  }
})
</script>

<template>
  <div class="max-w-md mx-auto space-y-5">
    <!-- Header -->
    <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 text-white relative overflow-hidden">
      <div class="absolute -right-8 -top-8 w-32 h-32 border border-white/10 rounded-full" />
      <div class="text-xs tracking-widest uppercase text-gold font-bold mb-1">
        Scanner
      </div>
      <h1 class="text-2xl font-bold">
        Scan a student QR or ID
      </h1>
      <p class="text-white/50 text-sm mt-1">
        A student's QR code, or the barcode / number on their ID. Location must be on — you have to be at the venue.
        On iPhone, scan QR codes and use the number search below for the rest.
      </p>
    </div>

    <!-- BC-6: storage the browser may evict, stated plainly rather than hidden -->
    <div
      v-if="showStorageNotice && storageState.message"
      data-testid="scan-storage-notice"
      class="rounded-xl border-l-4 px-4 py-3 text-sm"
      :class="storageState.lowSpace
        ? 'border-danger bg-danger/10 text-danger'
        : 'border-gold bg-gold/10 text-navy'"
    >
      {{ storageState.message }}
    </div>

    <!-- Which event -->
    <Card>
      <CardContent class="p-4 space-y-2">
        <label class="text-xs font-bold uppercase tracking-wide text-slate">Event</label>
        <select v-model="eventId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
          <option value="">
            Pick the event…
          </option>
          <option v-for="e in events" :key="e.id" :value="e.id">
            {{ e.title }} — {{ new Date(e.date).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) }}
          </option>
        </select>
        <p v-if="selectedEvent" class="text-xs text-slate">
          Recording for <span class="font-semibold text-navy">{{ selectedEvent.title }}</span>.
        </p>
        <p v-else class="text-xs text-slate">
          A QR token carries its own event, but a student number needs one — pick it here.
        </p>
      </CardContent>
    </Card>

    <!-- Camera viewport -->
    <Card>
      <CardContent class="p-4">
        <div id="qr-scanner" ref="scannerRef" class="w-full rounded-xl overflow-hidden" />
        <div v-if="!scannerRef" class="text-center py-12 text-slate text-sm">
          Initializing camera...
        </div>
      </CardContent>
    </Card>

    <!-- Status -->
    <div v-if="scanning" class="text-center">
      <Badge variant="default" class="text-base px-4 py-1 animate-pulse">
        Processing scan...
      </Badge>
    </div>

    <!-- Result -->
    <div
      v-if="result"
      :class="[
        'rounded-xl border-l-4 px-4 py-3 text-sm font-medium',
        result.kind === 'ok'
          ? 'border-success bg-success/10 text-success'
          : result.kind === 'warn'
            ? 'border-gold bg-gold/10 text-navy'
            : 'border-danger bg-danger/10 text-danger'
      ]"
    >
      {{ result.message }}
    </div>

    <!-- Ambiguous scan: let the officer choose -->
    <Card v-if="candidates.length > 0">
      <CardContent class="p-4 space-y-2">
        <div class="text-xs font-bold uppercase tracking-wide text-slate">
          Which student?
        </div>
        <button
          v-for="student in candidates"
          :key="student.id"
          class="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-50"
          :disabled="scanning"
          @click="record(student.id, 'manual', student.name)"
        >
          <span class="font-semibold text-navy">{{ student.name }}</span>
          <span class="ml-2 font-mono text-xs text-slate">{{ student.studentNo || 'no number' }}</span>
          <span v-if="student.yearLevel" class="ml-2 text-xs text-slate">Year {{ student.yearLevel }}</span>
        </button>
      </CardContent>
    </Card>

    <!-- Offline queue (plan §8.2) -->
    <div v-if="!online" class="rounded-xl border-l-4 border-gold bg-gold/10 px-4 py-3 text-sm text-navy">
      No signal — scans are saved on this phone and sent automatically when the connection is back.
    </div>

    <Card v-if="pending.length > 0 || refused.length > 0" id="queue">
      <CardContent class="p-4 space-y-3">
        <div
          v-if="capacity.atCap"
          data-testid="scan-queue-full"
          class="rounded-lg border-l-4 border-danger bg-danger/10 px-3 py-2 text-xs font-semibold text-danger"
        >
          {{ capacity.message }}
        </div>
        <div class="flex items-center justify-between">
          <div class="text-xs font-bold uppercase tracking-wide text-slate">
            Waiting to sync
          </div>
          <div class="flex items-center gap-2">
            <Badge :variant="pending.length > 0 ? 'warning' : 'success'">
              {{ pending.length }}
            </Badge>
            <button
              class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              :disabled="syncing || pending.length === 0"
              @click="syncNow"
            >
              {{ syncing ? 'Syncing…' : 'Sync now' }}
            </button>
          </div>
        </div>

        <ul v-if="pending.length > 0" class="divide-y divide-line text-sm">
          <li v-for="scan in pending" :key="scan.id" class="flex items-center gap-2 py-1.5">
            <span class="min-w-0 flex-1 truncate text-navy">{{ scan.label }}</span>
            <span class="shrink-0 text-xs text-slate">
              {{ new Date(scan.scannedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) }}
            </span>
            <button class="shrink-0 text-xs text-danger hover:underline" @click="forget(scan.id)">
              discard
            </button>
          </li>
        </ul>

        <div v-if="refused.length > 0" class="space-y-2" data-testid="scan-refused-list">
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs font-bold uppercase tracking-wide text-danger">
              Not recorded ({{ refused.length }})
            </div>
            <span v-if="unacknowledged.length === 0" class="text-xs font-semibold text-slate">
              Acknowledged
            </span>
          </div>
          <ul class="divide-y divide-line text-sm">
            <li v-for="row in refused" :key="row.scan.id" class="py-1.5">
              <div class="font-medium text-navy">
                {{ row.scan.label }}
              </div>
              <div class="text-xs text-danger">
                {{ row.reason }}
              </div>
            </li>
          </ul>
          <p class="text-xs text-slate">
            Confirm you have seen these before you leave the scanner — the banner keeps showing them until you do.
          </p>
          <button
            v-if="unacknowledged.length > 0"
            class="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger/90"
            @click="acknowledgeRefused"
          >
            Acknowledge {{ unacknowledged.length }}
          </button>
        </div>

        <p v-if="lastSyncedAt" class="text-xs text-slate">
          Last synced {{ new Date(lastSyncedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) }}.
        </p>
      </CardContent>
    </Card>

    <!-- Manual fallback: a phone died, or the barcode will not read -->
    <Card>
      <CardContent class="p-4 space-y-3">
        <div class="text-xs font-bold uppercase tracking-wide text-slate">
          Search by number or name
        </div>
        <form class="flex gap-2" @submit.prevent="handleManualSearch">
          <input
            v-model="manualQuery"
            class="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
            placeholder="2024-00123 or a name"
          >
          <button
            type="submit"
            class="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            :disabled="manualBusy"
          >
            {{ manualBusy ? '…' : 'Find' }}
          </button>
        </form>
        <p v-if="manualMessage" class="text-xs text-slate">
          {{ manualMessage }}
        </p>
        <div v-if="manualResults.length > 0" class="space-y-2">
          <button
            v-for="student in manualResults"
            :key="student.id"
            class="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-50"
            :disabled="manualBusy"
            @click="recordFromList(student)"
          >
            <span class="font-semibold text-navy">{{ student.name }}</span>
            <span class="ml-2 font-mono text-xs text-slate">{{ student.studentNo || 'no number' }}</span>
            <span v-if="student.section" class="ml-2 text-xs text-slate">{{ student.section }}</span>
          </button>
        </div>
      </CardContent>
    </Card>

    <!-- Back -->
    <div class="text-center">
      <button
        class="text-xs text-navy font-bold hover:underline"
        @click="router.push('/manage/events')"
      >
        Back to events
      </button>
    </div>

    <!-- Bottom stamp -->
    <div class="bg-gold rounded-lg px-5 py-3 flex items-center justify-between text-xs font-bold">
      <span class="text-navy-deep">ISUFST · Dingle Campus</span>
      <span class="text-yellow-900">{{ new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }}</span>
    </div>
  </div>
</template>
