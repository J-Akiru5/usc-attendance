<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEventStore } from '@/stores/events'
import { useDutyStore } from '@/stores/duties'
import { useGeolocation } from '@/composables/useGeolocation'
import { useOfflineQueue } from '@/composables/useOfflineQueue'
import { haversine } from '@/lib/haversine'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const events = useEventStore()
const dutyStore = useDutyStore()
const geo = useGeolocation()
const { enqueue } = useOfflineQueue()

const selectedEventId = ref<string | null>((route.params.eventId as string) || null)
const checkingIn = ref(false)
const checkingOut = ref(false)
const result = ref<{ success: boolean; message: string } | null>(null)
const mode = ref<'select' | 'geo' | 'qr'>('select')

const selectedEvent = computed(() =>
  events.events.find((e) => e.id === selectedEventId.value) || null
)

const distance = computed<number | null>(() => {
  if (!geo.latitude.value || !geo.longitude.value || !selectedEvent.value) return null
  return haversine(
    geo.latitude.value,
    geo.longitude.value,
    selectedEvent.value.lat,
    selectedEvent.value.lng
  )
})

const isInRange = computed(() => {
  if (distance.value === null || !selectedEvent.value) return false
  return distance.value <= selectedEvent.value.radiusMeters
})

const alreadyCheckedIn = computed(() => {
  if (!selectedEvent.value || !auth.user) return false
  return events.attendance.some((a) => a.userId === auth.user!.id && !a.checkOutAt)
})

const isCheckedOut = computed(() => {
  if (!selectedEvent.value || !auth.user) return false
  const record = events.attendance.find((a) => a.userId === auth.user!.id)
  return !!record?.checkOutAt
})

const checkInTime = computed(() => {
  if (!selectedEvent.value || !auth.user) return null
  const record = events.attendance.find((a) => a.userId === auth.user!.id)
  return record?.createdAt || null
})

const checkOutTime = computed(() => {
  if (!selectedEvent.value || !auth.user) return null
  const record = events.attendance.find((a) => a.userId === auth.user!.id)
  return record?.checkOutAt || null
})

const hasDutyToday = computed(() => {
  if (!auth.user) return false
  return dutyStore.hasDutyToday(auth.user.id)
})

const dutyAlreadyCheckedIn = computed(() => {
  if (!auth.user) return false
  return dutyStore.isCheckedInForDuty(auth.user.id)
})

onMounted(async () => {
  await events.fetchEvents()
  await dutyStore.fetchTodayDutyAttendance()
  if (selectedEventId.value) {
    await events.fetchAttendance(selectedEventId.value)
    mode.value = 'geo'
  }
  geo.startWatching()
})

async function handleCheckIn() {
  if (!selectedEvent.value || !auth.user || !geo.latitude.value || !geo.longitude.value) return

  checkingIn.value = true
  result.value = null

  try {
    if (navigator.onLine) {
      await events.checkIn(
        selectedEvent.value.id,
        auth.user.id,
        geo.latitude.value,
        geo.longitude.value
      )
      result.value = { success: true, message: 'Check-in successful!' }
      await events.fetchAttendance(selectedEventId.value!)
    } else {
      await enqueue({
        eventId: selectedEvent.value.id,
        userId: auth.user.id,
        method: 'self',
        lat: geo.latitude.value,
        lng: geo.longitude.value,
        recordedBy: auth.user.id,
      }, 'checkin')
      result.value = { success: true, message: 'Check-in queued — will sync when online' }
    }
  } catch (err: unknown) {
    result.value = { success: false, message: err instanceof Error ? err.message : 'Check-in failed' }
  } finally {
    checkingIn.value = false
  }
}

async function handleCheckOut() {
  if (!selectedEvent.value || !auth.user) return

  checkingOut.value = true
  result.value = null

  try {
    await events.checkOut(selectedEvent.value.id, auth.user.id)
    result.value = { success: true, message: 'Check-out successful!' }
    await events.fetchAttendance(selectedEventId.value!)
  } catch (err: unknown) {
    result.value = { success: false, message: err instanceof Error ? err.message : 'Check-out failed' }
  } finally {
    checkingOut.value = false
  }
}

function selectEvent(id: string) {
  selectedEventId.value = id
  mode.value = 'geo'
  result.value = null
  events.fetchAttendance(id)
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
</script>

<template>
  <div class="max-w-md mx-auto space-y-5">
    <!-- Header (matches mockup) -->
    <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 text-white relative overflow-hidden">
      <div class="absolute -right-8 -top-8 w-32 h-32 border border-white/10 rounded-full" />
      <div class="absolute right-2 top-2 w-20 h-20 border border-white/10 rounded-full" />

      <div class="flex items-center justify-between mb-4">
        <div class="w-10 h-10 rounded-full bg-navy border-2 border-gold flex items-center justify-center text-gold font-bold text-xs">
          USC
        </div>
        <div class="text-xs text-white/50 font-mono">
          {{ new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }}
        </div>
      </div>

      <div class="text-xs tracking-widest uppercase text-gold font-bold mb-1">USC Attendance</div>
      <h1 class="text-2xl font-bold">{{ getGreeting() }},<br />{{ auth.user?.name }}</h1>
      <p class="text-white/50 text-sm mt-1">{{ auth.user?.position }}</p>
    </div>

    <!-- Duty Card (if has duty today) -->
    <div
      v-if="hasDutyToday && !dutyAlreadyCheckedIn"
      class="bg-paper-panel rounded-xl border border-gold/30 p-4 cursor-pointer hover:shadow-md transition-shadow"
      @click="router.push('/duty')"
    >
      <div class="flex items-center gap-3">
        <div class="w-2.5 h-2.5 rounded-full bg-gold shadow-[0_0_0_4px_rgba(201,162,75,0.15)]" />
        <div class="flex-1">
          <div class="text-xs text-gold-dark font-bold uppercase tracking-wider">Office Duty</div>
          <div class="font-bold text-navy">You have duty today</div>
        </div>
        <Badge variant="warning">Tap to check in</Badge>
      </div>
    </div>

    <!-- Mode selector (no event pre-selected) -->
    <div v-if="mode === 'select' && !selectedEventId">
      <!-- Check-in method tabs -->
      <div class="flex gap-2 mb-4">
        <button
          class="flex-1 py-2.5 text-sm font-bold rounded-lg bg-navy text-white"
        >
          📍 Location
        </button>
        <button
          class="flex-1 py-2.5 text-sm font-bold rounded-lg bg-paper-panel text-navy border border-line"
          @click="router.push('/qr?eventId=' + (selectedEventId || ''))"
        >
          📱 QR Code
        </button>
      </div>

      <h2 class="text-sm font-bold text-navy uppercase tracking-wider mb-3">Select an event</h2>
      <div v-if="events.events.length === 0" class="text-sm text-slate text-center py-8 bg-paper-panel rounded-xl border border-line">
        No events available
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="event in events.events"
          :key="event.id"
          class="bg-paper-panel rounded-xl border border-line p-4 cursor-pointer hover:shadow-md transition-shadow"
          @click="selectEvent(event.id)"
        >
          <div class="text-xs text-gold-dark font-bold uppercase tracking-wider">Session</div>
          <div class="font-bold text-navy">{{ event.title }}</div>
          <div class="text-xs text-slate">{{ formatTime(event.date) }}</div>
        </div>
      </div>
    </div>

    <template v-else-if="selectedEventId && mode === 'geo'">
      <!-- Status Card (matches mockup) -->
      <Card>
        <CardContent class="p-5">
          <div class="flex items-center gap-3 mb-3">
            <div
              :class="[
                'w-2.5 h-2.5 rounded-full',
                isInRange ? 'bg-success shadow-[0_0_0_4px_rgba(63,125,92,0.15)]' : 'bg-danger shadow-[0_0_0_4px_rgba(162,62,62,0.15)]',
              ]"
            />
            <span class="text-sm font-bold text-ink">
              {{ isInRange ? 'Within check-in range' : 'Outside check-in range' }}
            </span>
          </div>
          <div class="text-xs text-slate pl-[22px]">
            <template v-if="distance !== null">
              {{ Math.round(distance) }}m from venue
            </template>
            <template v-else-if="geo.loading.value">
              Getting your location...
            </template>
            <template v-else-if="geo.error.value">
              {{ geo.error.value }}
            </template>
          </div>
        </CardContent>
      </Card>

      <!-- Event Info (matches mockup) -->
      <div>
        <div class="text-xs text-gold-dark font-bold uppercase tracking-wider mb-1">Today's session</div>
        <div class="text-lg font-bold text-navy-deep">{{ selectedEvent?.title }}</div>
        <div class="text-xs text-slate">Starts {{ formatTime(selectedEvent?.date || '') }}</div>
      </div>

      <!-- Result Message -->
      <div
        v-if="result"
        :class="[
          'rounded-xl border-l-4 px-4 py-3 text-sm font-medium',
          result.success
            ? 'border-success bg-success/10 text-success'
            : 'border-danger bg-danger/10 text-danger',
        ]"
      >
        {{ result.message }}
      </div>

      <!-- Already checked in — show checkout option -->
      <div v-if="alreadyCheckedIn && !isCheckedOut" class="space-y-3">
        <div class="text-center py-2">
          <Badge variant="success" class="text-base px-4 py-1">Checked in</Badge>
          <div v-if="checkInTime" class="text-xs text-slate mt-2">
            Check-in: {{ formatTime(checkInTime) }}
          </div>
        </div>
        <button
          :disabled="checkingOut"
          class="w-full bg-gradient-to-br from-navy to-navy-deep rounded-2xl p-6 flex flex-col items-center gap-1.5 shadow-lg shadow-navy/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
          @click="handleCheckOut"
        >
          <span class="text-lg font-black text-white">
            {{ checkingOut ? 'Checking out...' : 'Check Out' }}
          </span>
          <span class="text-xs text-white/60">End your session</span>
        </button>
      </div>

      <!-- Fully checked out -->
      <div v-if="isCheckedOut" class="text-center py-4 space-y-2">
        <Badge variant="success" class="text-base px-4 py-1">Session complete</Badge>
        <div class="text-xs text-slate">
          <div v-if="checkInTime">Check-in: {{ formatTime(checkInTime) }}</div>
          <div v-if="checkOutTime">Check-out: {{ formatTime(checkOutTime) }}</div>
        </div>
      </div>

      <!-- Check In Button (matches mockup) -->
      <button
        v-if="!alreadyCheckedIn"
        :disabled="!isInRange || checkingIn || geo.loading.value"
        class="w-full bg-gradient-to-br from-gold to-yellow-700 rounded-2xl p-6 flex flex-col items-center gap-1.5 shadow-lg shadow-gold/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
        @click="handleCheckIn"
      >
        <span class="text-lg font-black text-ink">
          {{ checkingIn ? 'Checking in...' : 'Check in now' }}
        </span>
        <span class="text-xs text-yellow-900">Location confirmed automatically</span>
      </button>

      <!-- QR alternative -->
      <div class="text-center text-xs text-slate">
        Prefer QR?
        <button
          class="text-navy font-bold hover:underline"
          @click="router.push('/qr?eventId=' + selectedEventId)"
        >
          Show QR code
        </button>
      </div>

      <!-- Change event -->
      <div class="text-center">
        <button class="text-xs text-slate hover:text-navy" @click="selectedEventId = null; mode = 'select'">
          &larr; Choose a different event
        </button>
      </div>
    </template>

    <!-- Bottom stamp (matches mockup) -->
    <div class="bg-gold rounded-lg px-5 py-3 flex items-center justify-between text-xs font-bold">
      <span class="text-navy-deep">ISUFST · Dingle Campus</span>
      <span class="text-yellow-900">{{ new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }}</span>
    </div>
  </div>
</template>
