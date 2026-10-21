<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEventStore } from '@/stores/events'
import { api } from '@/lib/api'

definePageMeta({ layout: 'dashboard', requiresAuth: true })

const route = useRoute()
const auth = useAuthStore()
const events = useEventStore()

/** Replace the code this many seconds before it stops working. */
const REFRESH_LEAD_SECONDS = 5
/** Wait this long after a failed refresh before trying again. */
const REFRESH_RETRY_MS = 5000
/**
 * The server rotates the code every 30 seconds (owner decision, unchanged).
 * The local countdown never runs longer than this, so a phone whose clock is
 * behind the server still replaces the code on time.
 */
const QR_TOKEN_LIFETIME_SECONDS = 30

const eventId = ref(route.query.eventId as string)
const token = ref<string | null>(null)
const error = ref<string | null>(null)
/** Epoch milliseconds when the displayed token stops being valid. */
const expiresAt = ref(0)
/** Whole seconds the displayed token remains valid. */
const timeLeft = ref(0)
/** Whole seconds until the code is replaced; explicit in the UI. */
const refreshIn = ref(0)
/** Lifetime of the current token, used for the progress bar. */
const lifetimeSeconds = ref(30)

let tickInterval: ReturnType<typeof setInterval> | null = null
let inFlight: Promise<void> | null = null
let inFlightGeneration = -1
let requestGeneration = 0
let retryAfter = 0

async function refreshQR() {
  if (!auth.user || !eventId.value) return
  // A request for an older event must neither block nor overwrite this one.
  if (inFlight && inFlightGeneration === requestGeneration) return inFlight

  const generation = requestGeneration
  inFlightGeneration = generation
  const request = (async () => {
    try {
      const res = await api.post<{ token: string, exp: number }>('/attendance/qr-token', {
        eventId: eventId.value
      })
      if (generation !== requestGeneration) return
      const now = Date.now()
      const serverRemaining = res.exp - Math.floor(now / 1000)
      if (serverRemaining <= 0) {
        // The phone clock is ahead of the server's. The token is already
        // expired server-side, so it is never shown; a clear message beats a
        // code the officer will reject.
        token.value = null
        expiresAt.value = 0
        lifetimeSeconds.value = QR_TOKEN_LIFETIME_SECONDS
        error.value = 'This phone\'s clock is ahead of the server, so the code cannot be shown safely. Set the clock to automatic and try again.'
        retryAfter = Date.now() + REFRESH_RETRY_MS
        return
      }
      const lifetime = Math.min(serverRemaining, QR_TOKEN_LIFETIME_SECONDS)
      token.value = res.token
      expiresAt.value = now + lifetime * 1000
      lifetimeSeconds.value = lifetime
      error.value = null
      retryAfter = 0
    } catch (err) {
      if (generation !== requestGeneration) return
      error.value = err instanceof Error ? err.message : 'Could not generate QR token'
      retryAfter = Date.now() + REFRESH_RETRY_MS
      // A token already past its expiry must never stay on screen.
      if (Date.now() >= expiresAt.value) {
        token.value = null
        timeLeft.value = 0
        refreshIn.value = 0
      }
    }
  })().finally(() => {
    if (inFlightGeneration === generation) {
      inFlight = null
      inFlightGeneration = -1
    }
    if (generation === requestGeneration) updateClock()
  })

  inFlight = request
  return request
}

/**
 * Recomputes both countdowns from the token's own expiry instead of decrementing
 * whatever the last tick left behind. A tab that was backgrounded (where
 * timers are throttled or suspended) therefore resumes with the truth.
 */
function updateClock() {
  const now = Date.now()
  if (!token.value) {
    timeLeft.value = 0
    refreshIn.value = 0
    if (now >= retryAfter && !inFlight) void refreshQR()
    return
  }

  const seconds = Math.max(0, Math.ceil((expiresAt.value - now) / 1000))
  timeLeft.value = seconds
  refreshIn.value = Math.max(0, seconds - REFRESH_LEAD_SECONDS)

  if (seconds <= 0) {
    // We know this token is expired: clear it before asking for a new one.
    token.value = null
    if (now >= retryAfter) void refreshQR()
    return
  }

  if (seconds <= REFRESH_LEAD_SECONDS && now >= retryAfter) void refreshQR()
}

function startTicking() {
  if (tickInterval) clearInterval(tickInterval)
  tickInterval = null
  if (!auth.user || !eventId.value) return
  updateClock()
  void refreshQR()
  tickInterval = setInterval(updateClock, 1000)
}

/**
 * A backgrounded tab throttles timers, so the visible page refreshes as soon as
 * it returns rather than trusting the countdown it went away with.
 */
function handleVisibility() {
  if (document.visibilityState !== 'visible' || !auth.user || !eventId.value) return
  retryAfter = 0
  void refreshQR()
  updateClock()
}

onMounted(async () => {
  if (!eventId.value) {
    await events.fetchEvents()
  }
  document.addEventListener('visibilitychange', handleVisibility)
  if (auth.user && eventId.value) startTicking()
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibility)
  if (tickInterval) clearInterval(tickInterval)
  tickInterval = null
  // Drop any response still in flight for this page.
  requestGeneration += 1
})

function selectEvent(id: string) {
  // A response from the previous event must never become the visible code.
  requestGeneration += 1
  eventId.value = id
  token.value = null
  error.value = null
  expiresAt.value = 0
  timeLeft.value = 0
  refreshIn.value = 0
  lifetimeSeconds.value = 30
  retryAfter = 0
  startTicking()
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function copyToken() {
  if (token.value) {
    navigator.clipboard.writeText(token.value)
  }
}
</script>

<template>
  <div class="max-w-md mx-auto space-y-5">
    <!-- Header -->
    <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 text-white relative overflow-hidden">
      <div class="absolute -right-8 -top-8 w-32 h-32 border border-white/10 rounded-full" />
      <div class="text-xs tracking-widest uppercase text-gold font-bold mb-1">
        QR Check-In
      </div>
      <h1 class="text-2xl font-bold">
        Show your QR code
      </h1>
      <p class="text-white/75 text-sm mt-1">
        Staff will scan this to record your attendance
      </p>
    </div>

    <!-- Event Selector -->
    <div v-if="!eventId">
      <h2 class="text-sm font-bold text-navy uppercase tracking-wider mb-3">
        Select an event
      </h2>
      <div v-if="events.events.length === 0" class="text-sm text-slate text-center py-8 bg-paper-panel rounded-xl border border-line">
        No events available
      </div>
      <div v-else class="space-y-2">
        <button
          v-for="event in events.events"
          :key="event.id"
          type="button"
          class="min-h-11 w-full rounded-xl border border-line bg-paper-panel p-4 text-left hover:shadow-md transition-shadow"
          @click="selectEvent(event.id)"
        >
          <div class="font-bold text-navy">
            {{ event.title }}
          </div>
          <div class="text-xs text-slate">
            {{ formatTime(event.date) }}
          </div>
        </button>
      </div>
    </div>

    <!-- QR Display -->
    <template v-else>
      <div class="bg-paper-panel rounded-xl border border-line p-6 text-center">
        <!-- QR placeholder using token data as visual -->
        <div
          class="w-48 h-48 mx-auto bg-white border-2 border-navy-deep rounded-xl flex items-center justify-center mb-4 relative overflow-hidden"
          role="img"
          :aria-label="token ? `Attendance QR code. A new code appears in ${refreshIn} seconds.` : error ? 'QR code could not be generated.' : 'Generating the attendance QR code.'"
        >
          <div v-if="token" class="flex flex-col items-center gap-1 p-2" aria-hidden="true">
            <div class="text-[8px] font-mono text-navy-deep break-all leading-tight text-center">
              {{ token.slice(0, 60) }}...
            </div>
            <div class="text-[10px] font-bold text-navy mt-2">
              USC QR TOKEN
            </div>
            <div class="text-[8px] text-slate">
              Valid for {{ timeLeft }}s
            </div>
          </div>
          <div v-else-if="error" class="text-danger text-sm p-2 text-center">
            {{ error }}
          </div>
          <div v-else class="text-slate text-sm">
            Generating...
          </div>
        </div>

        <!-- Countdown bar -->
        <div class="w-full h-1.5 bg-line rounded-full overflow-hidden mb-3">
          <div
            class="h-full bg-gold rounded-full transition-all duration-1000"
            :style="{ width: `${(timeLeft / lifetimeSeconds) * 100}%` }"
          />
        </div>

        <div v-if="token" class="mb-1 text-sm text-slate">
          New code in <span class="font-mono text-xl font-bold text-navy">{{ refreshIn }}s</span>
        </div>
        <p v-if="token" class="mb-4 text-xs text-slate">
          This code stops working when its own countdown reaches zero. A fresh one appears automatically,
          including when you come back to this page.
        </p>
        <p v-if="error && token" role="status" class="mb-4 text-xs font-semibold text-danger">
          {{ error }} Retrying automatically.
        </p>

        <button
          type="button"
          class="min-h-10 w-full bg-gradient-to-br from-gold to-yellow-700 rounded-xl py-3 text-sm font-bold text-ink shadow-lg shadow-gold/30 disabled:opacity-50"
          :disabled="!token"
          @click="copyToken"
        >
          Copy Token (for testing)
        </button>
      </div>

      <div class="text-center">
        <button
          type="button"
          class="inline-flex min-h-6 items-center text-xs text-slate hover:text-navy"
          @click="eventId = ''"
        >
          &larr; Choose a different event
        </button>
      </div>
    </template>

    <!-- Bottom stamp -->
    <div class="bg-gold rounded-lg px-5 py-3 flex items-center justify-between text-xs font-bold">
      <span class="text-navy-deep">ISUFST · Dingle Campus</span>
      <span class="text-navy-deep">{{ new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }}</span>
    </div>
  </div>
</template>
