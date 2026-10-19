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

const eventId = ref(route.query.eventId as string)
const token = ref<string | null>(null)
const error = ref<string | null>(null)
const timeLeft = ref(30)
let refreshInterval: ReturnType<typeof setInterval> | null = null
let countdownInterval: ReturnType<typeof setInterval> | null = null

async function refreshQR() {
  if (!auth.user || !eventId.value) return
  try {
    const res = await api.post<{ token: string, exp: number }>('/attendance/qr-token', {
      eventId: eventId.value
    })
    token.value = res.token
    error.value = null
    // Count down from the token's own expiry (server-clock authority) rather
    // than a hard-coded window, so the display can never disagree with it.
    timeLeft.value = Math.max(0, res.exp - Math.floor(Date.now() / 1000))
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not generate QR token'
  }
}

onMounted(async () => {
  if (!eventId.value) {
    await events.fetchEvents()
  }
  if (auth.user && eventId.value) {
    refreshQR()
    refreshInterval = setInterval(refreshQR, 25000) // refresh every 25s, ahead of the 30s expiry
    countdownInterval = setInterval(() => {
      if (timeLeft.value > 0) timeLeft.value--
    }, 1000)
  }
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  if (countdownInterval) clearInterval(countdownInterval)
})

function selectEvent(id: string) {
  eventId.value = id
  if (refreshInterval) clearInterval(refreshInterval)
  if (countdownInterval) clearInterval(countdownInterval)
  refreshQR()
  refreshInterval = setInterval(refreshQR, 25000) // refresh every 25s, ahead of the 30s expiry
  countdownInterval = setInterval(() => {
    if (timeLeft.value > 0) timeLeft.value--
  }, 1000)
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
          :aria-label="token ? `Attendance QR code. It refreshes in ${timeLeft} seconds.` : error ? 'QR code could not be generated.' : 'Generating the attendance QR code.'"
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
            :style="{ width: `${(timeLeft / 30) * 100}%` }"
          />
        </div>

        <div class="text-xs text-slate mb-4">
          Auto-refreshes in <span class="font-mono font-bold text-navy">{{ timeLeft }}s</span>
        </div>

        <button
          type="button"
          class="min-h-10 w-full bg-gradient-to-br from-gold to-yellow-700 rounded-xl py-3 text-sm font-bold text-ink shadow-lg shadow-gold/30"
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
