<script setup lang="ts">
import { computed, ref, shallowRef, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { api, ApiError, getSupabaseClient, isOfflineError } from '@/lib/api'
import { useGeolocation } from '@/composables/useGeolocation'
import { useScanQueue } from '@/composables/useScanQueue'
import { useAuthStore } from '@/stores/auth'
import { classifyScan, findExactStudent } from '@/utils/scan'
import {
  feedbackFor,
  scanFailureState,
  startStudentScanner,
  vibrateFeedback,
  type ScanFeedback,
  type ScanFeedbackState,
  type ScannerHandle
} from '@/utils/scanner-engine'
import { canQueueScan, scanIdempotencyKey, storageAdvice, unacknowledgedRefusals } from '@/utils/scan-queue'
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
const auth = useAuthStore()
const {
  pending,
  refused,
  acknowledgedIds,
  storage,
  ownership,
  ownershipMessage,
  syncing,
  lastSyncedAt,
  online,
  enqueue,
  forget,
  acknowledgeRefused,
  claim,
  flush,
  refresh,
  refreshStorage,
  startWatching
} = useScanQueue()

const officerId = computed(() => auth.user?.id ?? '')
/**
 * T-0008: while the pending queue belongs to another officer, this account may
 * neither scan nor sync. The rows stay on the phone for the officer who took
 * them; the message never names that officer.
 */
const locked = computed(() => ownership.value === 'foreign')
const lockMessage = computed(() => ownershipMessage.value ?? 'This phone is holding scans taken by a different officer. Nothing was sent. Sign back in as that officer to sync them.')

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
/**
 * T-0012: the banner is driven by the pure outcome mapping, so every path that
 * reports an outcome gets the same label, tone and vibration pattern.
 */
const result = ref<{ feedback: ScanFeedback, message: string } | null>(null)
const resultTone = computed(() => {
  switch (result.value?.feedback.tone) {
    case 'success':
      return 'border-success bg-success/10 text-success'
    case 'warning':
      return 'border-gold bg-gold/10 text-navy'
    case 'info':
      return 'border-navy bg-navy/10 text-navy'
    case 'danger':
      return 'border-danger bg-danger/10 text-danger'
    default:
      return ''
  }
})
const candidates = ref<LookupStudent[]>([])
/** Why an officer is recording by hand; required for `method: 'manual'`. */
const manualReason = ref('')
/**
 * T-0009: the student-ID photo captured for the manual fallback. It is optional
 * (a dead camera must not block the check-in), kept as a Blob so it can travel
 * with an offline scan, and previewed through a local object URL only.
 */
const manualPhoto = shallowRef<{ blob: Blob, previewUrl: string, capturedAt: string } | null>(null)
const manualPhotoError = ref('')
const photoInput = ref<HTMLInputElement | null>(null)
/** Queued manual scans that synced after their photo upload was refused. */
const photoMissing = ref(0)
const MAX_PHOTO_BYTES = 1_572_864
const scannerRef = ref<HTMLDivElement | null>(null)
let scanner: ScannerHandle | null = null
// T-0012: the torch control only exists when the live camera track reports one.
// iOS Safari does not expose torch support, so there it never renders.
const torchSupported = ref(false)
const torchOn = ref(false)
const torchBusy = ref(false)

// A camera fires the same code many times a second; one scan per two seconds is
// plenty and keeps a queue from forming.
const cooldownUntil = ref(0)
const SCAN_COOLDOWN_MS = 2000
let stopWatching: (() => void) | undefined

// One polite live-region sentence for the queue, instead of making every list
// row a live region (WCAG 4.1.3 Status Messages).
const syncAnnouncement = computed(() => {
  if (locked.value) {
    return 'This phone is holding scans from another officer. This account cannot send them.'
  }
  if (syncing.value) {
    return pending.value.length > 0
      ? `Syncing ${pending.value.length} queued check-in${pending.value.length === 1 ? '' : 's'}.`
      : 'Syncing queued check-ins.'
  }
  if (pending.value.length > 0) {
    return `${pending.value.length} check-in${pending.value.length === 1 ? '' : 's'} waiting to sync.`
  }
  if (refused.value.length > 0) {
    return `${refused.value.length} scan${refused.value.length === 1 ? '' : 's'} not recorded.`
  }
  if (lastSyncedAt.value) return 'All queued check-ins are synced.'
  return ''
})

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

/**
 * Shows the outcome and, where the phone has the Vibration API, buzzes the
 * pattern for it. The vibration is best-effort: a missing or refusing API is
 * silent and never turns a recorded scan into an error.
 */
function say(state: ScanFeedbackState, message: string) {
  result.value = { feedback: feedbackFor(state), message }
  vibrateFeedback(state)
}

/** A thrown scan failure, split into the banner's outcome and its sentence. */
function failureFeedback(error: unknown): { state: ScanFeedbackState, message: string } {
  const message = error instanceof Error ? error.message : 'Scan failed'
  return {
    state: scanFailureState({
      ...(error instanceof ApiError ? { status: error.status } : {}),
      message
    }),
    message
  }
}

/**
 * T-0012: tries the torch and, if the platform refuses the constraint, hides
 * the control instead of reporting an error over the camera. The scan keeps
 * running either way.
 */
async function toggleTorch() {
  if (!scanner || !torchSupported.value || torchBusy.value) return
  torchBusy.value = true
  const next = !torchOn.value
  try {
    const applied = await scanner.setTorch(next)
    if (applied) {
      torchOn.value = next
    } else {
      torchOn.value = false
      torchSupported.value = false
    }
  } catch {
    torchOn.value = false
    torchSupported.value = false
  } finally {
    torchBusy.value = false
  }
}

// --- T-0009: student-ID photo capture ---------------------------------------
function clearManualPhoto() {
  if (manualPhoto.value) URL.revokeObjectURL(manualPhoto.value.previewUrl)
  manualPhoto.value = null
  manualPhotoError.value = ''
  if (photoInput.value) photoInput.value.value = ''
}

interface DecodedPhoto {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/** ImageBitmap where it exists, an <img> otherwise — both are client-only. */
async function decodePhoto(file: File): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // Fall through to the <img> decoder; some browsers refuse HEIC here.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('That file is not a readable image — take the photo again.'))
      element.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url)
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('This browser could not prepare the photo — try another photo.'))
    }, 'image/jpeg', quality)
  })
}

/**
 * Re-encodes the picture through a canvas. That strips EXIF (including a
 * phone's location) and keeps the file under the server's 1.5 MB cap. The
 * server enforces both independently; this is courtesy, not trust.
 */
async function preparePhoto(file: File): Promise<Blob> {
  const looksLikeImage = file.type.startsWith('image/') || /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name)
  if (!looksLikeImage) {
    throw new Error('Choose a photo of the student ID (JPEG, PNG or WebP).')
  }
  const decoded = await decodePhoto(file)
  try {
    const scale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(decoded.width * scale))
    canvas.height = Math.max(1, Math.round(decoded.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not prepare the photo.')
    // JPEG has no transparency; white keeps a PNG ID from turning black.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)

    let quality = 0.82
    let blob = await canvasJpeg(canvas, quality)
    while (blob.size > MAX_PHOTO_BYTES && quality > 0.4) {
      quality -= 0.1
      blob = await canvasJpeg(canvas, quality)
    }
    if (blob.size > MAX_PHOTO_BYTES) {
      throw new Error('That photo is still larger than 1.5 MB — take a closer, simpler photo.')
    }
    return blob
  } finally {
    decoded.release()
  }
}

async function handlePhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (manualPhoto.value) {
    URL.revokeObjectURL(manualPhoto.value.previewUrl)
    manualPhoto.value = null
  }
  manualPhotoError.value = ''
  try {
    const blob = await preparePhoto(file)
    manualPhoto.value = {
      blob,
      previewUrl: URL.createObjectURL(blob),
      capturedAt: new Date().toISOString()
    }
  } catch (error) {
    manualPhotoError.value = error instanceof Error ? error.message : 'Could not read that photo.'
    input.value = ''
  }
}

/**
 * Uploads the photo before the check-in and returns the server's opaque
 * reference. There is deliberately no public URL on either side.
 */
async function uploadAttendancePhoto(
  blob: Blob,
  meta: { eventId: string, userId: string, idempotencyKey: string, capturedAt: string }
): Promise<string> {
  const client = getSupabaseClient()
  const session = client ? (await client.auth.getSession()).data.session : null
  const form = new FormData()
  form.append('photo', blob, 'student-id.jpg')
  form.append('eventId', meta.eventId)
  form.append('userId', meta.userId)
  form.append('idempotencyKey', meta.idempotencyKey)
  form.append('capturedAt', meta.capturedAt)

  let response: Response
  try {
    response = await fetch('/api/attendance/photo', {
      method: 'POST',
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: form
    })
  } catch {
    throw new ApiError('You appear to be offline. This will be recorded when the connection is back.', 0)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string }
    throw new ApiError(body.error || `Photo upload failed (${response.status})`, response.status)
  }
  const body = await response.json() as { photoRef?: string }
  if (!body.photoRef) throw new ApiError('The server did not return a photo reference.', 500)
  return body.photoRef
}

/**
 * Sends a queued scan — the offline queue's half of the contract: the moment it
 * was taken travels with it, and the server judges it as of that moment (§8.2).
 * The stable key makes a retry a replay rather than a second check-in (BC-5).
 */
async function sendQueued(scan: QueuedScan) {
  const idempotencyKey = scanIdempotencyKey(scan)

  if (scan.kind === 'qr' && scan.token) {
    await api.post('/attendance/qr', {
      token: scan.token,
      lat: scan.lat,
      lng: scan.lng,
      accuracy: scan.accuracy,
      scannedAt: scan.scannedAt,
      idempotencyKey
    })
    return
  }

  // T-0009: upload the queued photo first. A lost connection keeps the whole
  // scan (Blob included) queued; a refusal must not lose the check-in, so the
  // attendance goes ahead and the server records the evidence as absent.
  let photoRef: string | undefined
  if (scan.kind === 'manual' && scan.photo && scan.userId) {
    try {
      photoRef = await uploadAttendancePhoto(scan.photo, {
        eventId: scan.eventId,
        userId: scan.userId,
        idempotencyKey,
        capturedAt: scan.photoCapturedAt ?? scan.scannedAt
      })
    } catch (error) {
      if (isOfflineError(error)) throw error
      photoMissing.value += 1
    }
  }

  await api.post('/attendance', {
    type: 'event',
    eventId: scan.eventId,
    userId: scan.userId,
    method: scan.kind === 'barcode' ? 'barcode' : 'manual',
    lat: scan.lat,
    lng: scan.lng,
    accuracy: scan.accuracy,
    scannedAt: scan.scannedAt,
    idempotencyKey,
    ...(scan.manualReason ? { manualReason: scan.manualReason } : {}),
    ...(photoRef ? { photoRef } : {})
  })
}

async function syncNow() {
  if (!officerId.value) {
    say('error', 'Your session is not ready — reload the page and sign in again.')
    return
  }
  const result = await flush(sendQueued, officerId.value)
  if (result.outcome === 'locked') {
    say('refused', result.message)
    return
  }
  if (result.outcome === 'throttled') {
    say('queued', 'The server has paused scanning for this account for now. Everything is still queued on this phone and will retry after the pause.')
    return
  }
  if (pending.value.length === 0 && refused.value.length === 0) say('recorded', 'Everything is synced.')
}

async function queueOffline(scan: Omit<QueuedScan, 'id'>): Promise<boolean> {
  if (!officerId.value) {
    say('error', 'Your session is not ready — nothing was saved. Reload the page and sign in again.')
    return false
  }
  if (locked.value) {
    say('refused', lockMessage.value)
    return false
  }

  // Refuse loudly at the hard cap rather than growing an unrecoverable queue.
  const room = canQueueScan(pending.value.length)
  if (!room.allowed) {
    say('refused', room.message ?? 'This phone is full of unsynced scans. Sync before scanning more.')
    return false
  }

  // Before the first queued scan, ask the browser to protect this origin's
  // storage and record the answer. Later scans only refresh the estimate.
  if (!storage.value?.requested) await refreshStorage(true)
  else await refreshStorage(false)

  const stored = await enqueue({ ...scan, id: crypto.randomUUID() }, officerId.value)
  if (!stored.allowed) {
    say('refused', stored.message ?? 'This phone is full of unsynced scans. Sync before scanning more.')
    return false
  }
  say('queued', 'No signal — saved on this phone and sent automatically when the connection is back.')
  return true
}

/** Sign in a student by their ID — QR token or the number off an ID barcode. */
async function record(userId: string, method: 'manual' | 'barcode', name: string) {
  if (locked.value) throw new Error(lockMessage.value)
  if (!officerId.value) throw new Error('Your session is not ready — reload the page and sign in again.')

  const reason = method === 'manual' ? manualReason.value.trim() : ''
  if (method === 'manual' && !reason) {
    throw new Error('Add a short reason before recording a manual check-in.')
  }

  const pos = await position()
  // One key per scan, generated before the first attempt: if the response is
  // lost and the scan is queued, the retry presents the same key, so the server
  // returns the first record instead of refusing a duplicate (BC-5).
  const idempotencyKey = crypto.randomUUID()
  // The scan moment travels only with a queued scan: a live check-in is stamped
  // by the server, so a phone with a badly wrong clock cannot backdate one.
  const scannedAt = new Date().toISOString()
  const capturedPhoto = method === 'manual' ? manualPhoto.value : null

  // Upload the photo first (T-0009). A dead connection queues the pair; any
  // other refusal is reported but never stops the check-in itself.
  let photoRef: string | undefined
  let photoProblem = ''
  if (capturedPhoto) {
    try {
      photoRef = await uploadAttendancePhoto(capturedPhoto.blob, {
        eventId: eventId.value,
        userId,
        idempotencyKey,
        capturedAt: capturedPhoto.capturedAt
      })
    } catch (error) {
      if (isOfflineError(error)) {
        candidates.value = []
        const queued = await queueOffline({
          kind: 'manual',
          eventId: eventId.value,
          label: name,
          userId,
          idempotencyKey,
          scannedAt,
          manualReason: reason,
          photo: capturedPhoto.blob,
          photoCapturedAt: capturedPhoto.capturedAt,
          ...pos
        })
        // The pair is on the phone now; do not leave this student's ID on
        // screen for the next check-in.
        if (queued) {
          manualReason.value = ''
          clearManualPhoto()
        }
        return
      }
      photoProblem = error instanceof Error ? error.message : 'The ID photo could not be uploaded.'
    }
  }

  try {
    const row = await api.post<{ user?: { name?: string } }>('/attendance', {
      type: 'event',
      eventId: eventId.value,
      userId,
      method,
      lat: pos.lat,
      lng: pos.lng,
      accuracy: pos.accuracy,
      idempotencyKey,
      ...(reason && { manualReason: reason }),
      ...(photoRef && { photoRef })
    })
    candidates.value = []
    if (method === 'manual') manualReason.value = ''
    // The captured photo belongs to the check-in just recorded (or was not
    // used by a barcode scan); never leave it on screen for the next student.
    clearManualPhoto()
    const who = row.user?.name ?? name
    if (method === 'manual' && !capturedPhoto) {
      say('recorded', `Check-in recorded for ${who}. No ID photo was captured — the entry records that evidence as missing.`)
    } else if (photoProblem) {
      say('recorded', `Check-in recorded for ${who}. The ID photo was not attached: ${photoProblem}`)
    } else {
      say('recorded', `${method === 'barcode' ? 'ID scanned — check-in recorded' : 'Check-in recorded'} for ${who}`)
    }
  } catch (error) {
    if (!isOfflineError(error)) throw error
    candidates.value = []
    const queued = await queueOffline({
      kind: method === 'barcode' ? 'barcode' : 'manual',
      eventId: eventId.value,
      label: name,
      userId,
      idempotencyKey,
      scannedAt,
      ...(reason && { manualReason: reason }),
      ...(capturedPhoto && { photo: capturedPhoto.blob, photoCapturedAt: capturedPhoto.capturedAt }),
      ...pos
    })
    if (queued) {
      manualReason.value = ''
      clearManualPhoto()
    }
  }
}

async function lookup(q: string) {
  return api.get<{ query: string, exact: string | null, students: LookupStudent[] }>(
    `/events/${eventId.value}/student-lookup?q=${encodeURIComponent(q)}`
  )
}

async function scanQr(token: string) {
  if (locked.value) throw new Error(lockMessage.value)
  if (!officerId.value) throw new Error('Your session is not ready — reload the page and sign in again.')
  const pos = await position()
  const idempotencyKey = crypto.randomUUID()
  // Only a queued scan carries the device moment; a live one is stamped by the
  // server (see `record`).
  const scannedAt = new Date().toISOString()
  try {
    const response = await api.post<{ user?: { name?: string } }>('/attendance/qr', {
      token: token.trim(),
      lat: pos.lat,
      lng: pos.lng,
      accuracy: pos.accuracy,
      idempotencyKey
    })
    say('recorded', `Check-in recorded for ${response.user?.name ?? 'the student'}`)
  } catch (error) {
    if (!isOfflineError(error)) throw error
    await queueOffline({
      kind: 'qr',
      eventId: eventId.value,
      label: 'QR code',
      token: token.trim(),
      idempotencyKey,
      scannedAt,
      ...pos
    })
  }
}

/** A chosen candidate is still a real check-in attempt; report it the same way. */
async function recordCandidate(student: LookupStudent) {
  try {
    await record(student.id, 'barcode', student.name)
  } catch (err: unknown) {
    const failed = failureFeedback(err)
    say(failed.state, failed.message)
  }
}

async function handleScan(decodedText: string) {
  if (locked.value) {
    say('refused', lockMessage.value)
    return
  }
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
      say('refused', 'Pick the event above first — then the ID can be scanned.')
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
      say('refused', `No exact student number match for “${found.query}” — pick the right person below.`)
      return
    }

    // Nothing matched as a number; it may still be a token the classifier found odd.
    await scanQr(decodedText)
  } catch (err: unknown) {
    const failed = failureFeedback(err)
    say(failed.state, failed.message)
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
  if (locked.value) {
    manualMessage.value = lockMessage.value
    return
  }
  if (!officerId.value) {
    manualMessage.value = 'Your session is not ready — reload the page and sign in again.'
    return
  }
  if (!eventId.value) {
    manualMessage.value = 'Pick the event first.'
    return
  }
  if (!manualReason.value.trim()) {
    manualMessage.value = 'Add a short reason before recording a manual check-in.'
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
  // A foreign queue is not this officer's work to be warned about, and leaving
  // the page does not remove it from the phone.
  if (locked.value) return null
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
  if (officerId.value) await claim(officerId.value)
  await refreshStorage()
  stopWatching = startWatching(() => {
    if (officerId.value && !locked.value) void flush(sendQueued, officerId.value)
  })
  if (online.value && pending.value.length > 0 && !locked.value && officerId.value) {
    void flush(sendQueued, officerId.value)
  }

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
    if (scannerRef.value) {
      scanner = await startStudentScanner('qr-scanner', (decodedText: string) => {
        handleScan(decodedText)
      })
      // Only render the control when the live track reports a torch.
      torchSupported.value = scanner.torchSupported
    }
  } catch {
    say('error', 'Camera access required for scanning')
  }
})

onUnmounted(() => {
  stopWatching?.()
  if (manualPhoto.value) URL.revokeObjectURL(manualPhoto.value.previewUrl)
  if (scanner) {
    void scanner.stop()
    scanner = null
  }
  torchSupported.value = false
  torchOn.value = false
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
      <p class="text-white/75 text-sm mt-1">
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
        <label for="scan-event" class="block text-xs font-bold uppercase tracking-wide text-slate">Event</label>
        <select id="scan-event" v-model="eventId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
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
        <div class="relative">
          <div
            id="qr-scanner"
            ref="scannerRef"
            class="w-full rounded-xl overflow-hidden"
            role="group"
            aria-label="Camera preview"
          />
          <!-- T-0012: rendered only when the live track reports a torch. -->
          <button
            v-if="torchSupported"
            type="button"
            class="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-bold shadow-lg disabled:opacity-60"
            :class="torchOn
              ? 'border-gold bg-gold text-navy-deep'
              : 'border-white/30 bg-navy-deep/80 text-white'"
            :aria-pressed="torchOn"
            :aria-label="torchOn ? 'Turn torch off' : 'Turn torch on'"
            :disabled="torchBusy"
            @click="toggleTorch"
          >
            <span class="mr-1.5 h-2 w-2 rounded-full" :class="torchOn ? 'bg-navy-deep' : 'bg-white'" aria-hidden="true" />
            Torch
          </button>
        </div>
        <div v-if="!scannerRef" class="text-center py-12 text-slate text-sm">
          Initializing camera...
        </div>
      </CardContent>
    </Card>

    <!-- Status -->
    <div
      v-if="scanning"
      role="status"
      aria-live="polite"
      class="text-center"
    >
      <Badge variant="default" class="text-base px-4 py-1 animate-pulse">
        Processing scan...
      </Badge>
    </div>

    <!-- Result: large enough to read at arm's length in daylight (T-0012). -->
    <div
      v-if="result"
      data-testid="scan-result"
      :role="result.feedback.assertive ? 'alert' : 'status'"
      :aria-live="result.feedback.assertive ? 'assertive' : 'polite'"
      aria-atomic="true"
      :class="[
        'rounded-xl border-l-4 px-4 py-4 text-base font-semibold shadow-sm',
        resultTone
      ]"
    >
      <div class="flex items-start gap-3">
        <span class="mt-0.5 shrink-0 text-2xl leading-none" aria-hidden="true">
          {{ result.feedback.glyph }}
        </span>
        <div class="min-w-0">
          <p class="text-lg font-bold leading-tight">
            {{ result.feedback.label }}
          </p>
          <p class="mt-1 text-base font-medium leading-snug">
            {{ result.message }}
          </p>
        </div>
      </div>
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
          type="button"
          class="min-h-11 w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-50"
          :disabled="scanning"
          @click="recordCandidate(student)"
        >
          <span class="font-semibold text-navy">{{ student.name }}</span>
          <span class="ml-2 font-mono text-xs text-slate">{{ student.studentNo || 'no number' }}</span>
          <span v-if="student.yearLevel" class="ml-2 text-xs text-slate">Year {{ student.yearLevel }}</span>
        </button>
      </CardContent>
    </Card>

    <!-- Offline queue (plan §8.2) -->
    <div v-if="!online && !locked" role="status" class="rounded-xl border-l-4 border-gold bg-gold/10 px-4 py-3 text-sm text-navy">
      No signal — scans are saved on this phone and sent automatically when the connection is back.
    </div>

    <p class="sr-only" role="status" aria-live="polite">
      {{ syncAnnouncement }}
    </p>

    <!-- T-0008: a handed-over phone must not show or send the other officer's queue -->
    <div
      v-if="locked"
      data-testid="scan-queue-locked"
      role="alert"
      class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      <p class="font-semibold">
        Scans waiting from a different officer
      </p>
      <p class="mt-1">
        {{ lockMessage }}
      </p>
      <p class="mt-1 text-xs font-semibold">
        {{ pending.length }} unsynced scan{{ pending.length === 1 ? '' : 's' }} stay on this phone. Nothing has been sent, and this account cannot send them.
      </p>
    </div>
    <div
      v-else-if="ownershipMessage"
      data-testid="scan-queue-parked"
      role="status"
      class="rounded-xl border-l-4 border-gold bg-gold/10 px-4 py-3 text-sm text-navy"
    >
      {{ ownershipMessage }}
    </div>

    <Card v-if="!locked && (pending.length > 0 || refused.length > 0)" id="queue" :aria-busy="syncing">
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
              type="button"
              class="min-h-6 rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
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
            <button
              type="button"
              class="inline-flex min-h-6 shrink-0 items-center text-xs text-danger hover:underline"
              :aria-label="`Discard the queued check-in for ${scan.label}`"
              @click="forget(scan.id)"
            >
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
            Confirm you have seen these before you leave the scanner - the banner keeps showing them until you do.
          </p>
          <button
            v-if="unacknowledged.length > 0"
            type="button"
            class="min-h-6 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger/90"
            @click="acknowledgeRefused"
          >
            Acknowledge {{ unacknowledged.length }}
          </button>
        </div>

        <p v-if="photoMissing > 0" role="status" class="text-xs text-danger">
          {{ photoMissing }} manual check-in{{ photoMissing === 1 ? '' : 's' }} synced without ID photo evidence — the
          photo upload was refused. The attendance itself was recorded and marked as missing that evidence.
        </p>
        <p v-if="lastSyncedAt" class="text-xs text-slate">
          Last synced {{ new Date(lastSyncedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) }}.
        </p>
      </CardContent>
    </Card>

    <!-- Manual fallback: a phone died, or the barcode will not read -->
    <Card>
      <CardContent class="p-4 space-y-3">
        <div class="space-y-2">
          <span class="block text-xs font-bold uppercase tracking-wide text-slate">
            Photo of the student ID
          </span>
          <input
            ref="photoInput"
            type="file"
            accept="image/*"
            class="sr-only"
            data-testid="manual-photo-input"
            @change="handlePhotoSelected"
          >
          <div v-if="manualPhoto" class="space-y-2">
            <img
              :src="manualPhoto.previewUrl"
              alt="Preview of the captured student ID photo"
              class="max-h-48 w-full rounded-lg border border-line bg-paper object-contain"
            >
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-navy hover:bg-paper"
                @click="photoInput?.click()"
              >
                Retake photo
              </button>
              <button
                type="button"
                class="min-h-11 rounded-lg border border-danger/40 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
                @click="clearManualPhoto"
              >
                Remove photo
              </button>
            </div>
          </div>
          <button
            v-else
            type="button"
            class="min-h-11 w-full rounded-lg border border-dashed border-line px-3 py-2 text-sm font-semibold text-navy hover:bg-paper"
            @click="photoInput?.click()"
          >
            Take or choose a photo of the ID
          </button>
          <p v-if="manualPhotoError" role="alert" class="text-xs text-danger">
            {{ manualPhotoError }}
          </p>
          <p class="text-xs text-slate">
            Recommended. The photo is stored privately, visible only to roster staff, and deleted on the retention
            schedule. Without it the check-in is still recorded and marked as missing that evidence.
          </p>
        </div>
        <div class="space-y-1">
          <label for="scan-reason" class="block text-xs font-bold uppercase tracking-wide text-slate">
            Reason for manual entry
          </label>
          <input
            id="scan-reason"
            v-model="manualReason"
            name="manual-reason"
            maxlength="200"
            autocomplete="off"
            class="w-full rounded-lg border border-line px-3 py-2 text-sm"
            placeholder="e.g. phone dead, ID would not scan"
          >
          <p class="text-xs text-slate">
            Required — it is stored with the check-in and written to the audit log.
          </p>
        </div>
        <label for="scan-search" class="block text-xs font-bold uppercase tracking-wide text-slate">
          Search by number or name
        </label>
        <form class="flex gap-2" @submit.prevent="handleManualSearch">
          <input
            id="scan-search"
            v-model="manualQuery"
            name="student-search"
            class="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
            placeholder="2024-00123 or a name"
          >
          <button
            type="submit"
            class="min-h-10 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            :disabled="manualBusy"
          >
            {{ manualBusy ? '…' : 'Find' }}
          </button>
        </form>
        <p
          v-if="manualMessage"
          role="status"
          aria-live="polite"
          class="text-xs text-slate"
        >
          {{ manualMessage }}
        </p>
        <div v-if="manualResults.length > 0" class="space-y-2">
          <button
            v-for="student in manualResults"
            :key="student.id"
            type="button"
            class="min-h-11 w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-50"
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
        type="button"
        class="inline-flex min-h-6 items-center text-xs text-navy font-bold hover:underline"
        @click="router.push('/manage/events')"
      >
        Back to events
      </button>
    </div>

    <!-- Bottom stamp -->
    <div class="bg-gold rounded-lg px-5 py-3 flex items-center justify-between text-xs font-bold">
      <span class="text-navy-deep">ISUFST · Dingle Campus</span>
      <span class="text-navy-deep">{{ new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }}</span>
    </div>
  </div>
</template>
