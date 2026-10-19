<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEventStore } from '@/stores/events'
import { useDutyStore } from '@/stores/duties'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import MyEventAccess from '@/components/MyEventAccess.vue'
import { api } from '@/lib/api'
import type { USCEvent } from '@/types'

definePageMeta({ layout: 'dashboard', requiresAuth: true })

const auth = useAuthStore()
const events = useEventStore()
const dutyStore = useDutyStore()
const router = useRouter()
const todayEvents = ref<USCEvent[]>([])

// Pinned announcements (plan §8.4): the council's notices, seen by everyone.
interface PinnedAnnouncement { id: string, title: string, preview: string, sentAt: string | null, creator: { id: string, name: string } | null }
const pinnedAnnouncements = ref<PinnedAnnouncement[]>([])

async function loadPinned() {
  try {
    const data = await api.get<{ items: PinnedAnnouncement[] }>('/announcements/pinned')
    pinnedAnnouncements.value = data.items ?? []
  } catch {
    pinnedAnnouncements.value = []
  }
}

// Registration state for the signed-in person (plan §8.2): event id → status.
interface MyRegistration { status: 'registered' | 'waitlisted', position?: number | null, eventTitle?: string }
const myRegistrations = ref<Record<string, MyRegistration>>({})
const registrationBusy = ref('')
const registrationError = ref('')

// A student's own standing (plan §8.3: the same summary the staff view shows).
interface MyAttendance { events: number, attended: number, rate: number, signatures: { signed: number, rate: number } }
const myAttendance = ref<MyAttendance | null>(null)

// A student's own fines and clearance (plan §8.5).
interface MyFines {
  summary: { count: number, unpaid: number, unpaidCentavos: number, unpaidPesos: string, cleared: boolean }
  fines: Array<{ id: string, kind: string, status: string, event: { id: string, title: string } | null }>
}
const myFines = ref<MyFines | null>(null)

async function loadMyFines() {
  try {
    myFines.value = await api.get<MyFines>('/fines/mine')
  } catch {
    myFines.value = null
  }
}

async function loadMyAttendance() {
  if (!auth.user?.id) return
  try {
    const data = await api.get<{ summary: MyAttendance }>(`/analytics/students/${auth.user.id}`)
    myAttendance.value = data.summary
  } catch {
    myAttendance.value = null
  }
}

function portalField<T>(event: USCEvent, key: string): T | undefined {
  return (event as unknown as Record<string, T | undefined>)[key]
}

async function loadRegistrations() {
  try {
    const rows = await api.get<Array<{ status: string, event: { id: string } }>>('/registrations/mine')
    const map: Record<string, MyRegistration> = {}
    for (const row of rows) {
      map[row.event.id] = { status: row.status as MyRegistration['status'] }
    }
    myRegistrations.value = map
  } catch {
    myRegistrations.value = {}
  }
}

async function toggleRegistration(event: USCEvent) {
  registrationError.value = ''
  registrationBusy.value = event.id
  try {
    const mine = myRegistrations.value[event.id]
    if (mine) {
      await api.delete(`/events/${event.id}/registration`)
    } else {
      const res = await api.post<{ status: string, position: number | null }>(`/events/${event.id}/registration`, {})
      if (res.status === 'waitlisted') {
        // Position is shown next to the badge; store it for this render.
        myRegistrations.value = { ...myRegistrations.value, [event.id]: { status: 'waitlisted', position: res.position } }
      }
    }
    await loadRegistrations()
  } catch (err: unknown) {
    registrationError.value = err instanceof Error ? err.message : 'Could not update your registration'
  } finally {
    registrationBusy.value = ''
  }
}

function registrationLabel(event: USCEvent): string {
  const mine = myRegistrations.value[event.id]
  if (!mine) return 'Register'
  if (mine.status === 'waitlisted') return mine.position ? `Waitlisted — #${mine.position}` : 'Waitlisted'
  return 'Registered'
}

onMounted(async () => {
  await Promise.all([
    events.fetchEvents(),
    dutyStore.fetchTodayDutyAttendance(),
    loadPinned()
  ])
  const today = new Date().toISOString().split('T')[0] ?? ''
  todayEvents.value = events.events.filter(e => e.date.startsWith(today))
  if (auth.isStudent) {
    await Promise.all([loadRegistrations(), loadMyAttendance(), loadMyFines()])
  }
})

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Greeting Header (matches mockup) -->
    <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 md:p-8 text-white relative overflow-hidden">
      <div class="absolute -right-10 -top-10 w-40 h-40 border border-white/10 rounded-full" />
      <div class="absolute right-5 top-5 w-24 h-24 border border-white/10 rounded-full" />

      <div class="text-xs tracking-widest uppercase text-gold-soft font-mono mb-2">
        USC Attendance
      </div>
      <h1 class="text-2xl md:text-3xl font-bold font-serif">
        {{ getGreeting() }},<br>{{ auth.user?.name }}
      </h1>
      <p class="text-white/60 text-sm mt-1">
        {{ auth.user?.position }}
      </p>
    </div>

    <!-- Pinned announcements (plan §8.4) -->
    <Card v-if="pinnedAnnouncements.length > 0">
      <CardContent class="p-4 space-y-3">
        <div class="text-xs uppercase tracking-wide text-slate">
          Pinned
        </div>
        <div v-for="item in pinnedAnnouncements" :key="item.id" class="space-y-1">
          <div class="font-semibold text-navy font-serif">
            {{ item.title }}
          </div>
          <!-- Rendered server-side with every character escaped. -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="text-sm text-slate space-y-1" v-html="item.preview" />
          <div class="text-xs text-slate">
            {{ item.creator ? `by ${item.creator.name} · ` : '' }}{{ item.sentAt ? new Date(item.sentAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : '' }}
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Student view: show your QR at the venue; an officer scans it -->
    <div v-if="auth.isStudent" class="space-y-4">
      <Card v-if="myFines">
        <CardContent class="p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-wide text-slate">
              My fines
            </div>
            <div class="flex items-center gap-3">
              <span v-if="myFines.summary.cleared" class="text-sm font-semibold text-success">Cleared — nothing owed</span>
              <span v-else class="text-sm text-navy">
                <span class="font-mono font-semibold">{{ myFines.summary.unpaidPesos }}</span> unpaid
              </span>
              <Badge :variant="myFines.summary.cleared ? 'success' : 'warning'">
                {{ myFines.summary.unpaid }} unpaid
              </Badge>
            </div>
          </div>
          <ul v-if="myFines.fines.length > 0" class="mt-2 divide-y divide-line text-sm">
            <li v-for="fine in myFines.fines.slice(0, 3)" :key="fine.id" class="flex items-center justify-between gap-2 py-1.5">
              <span class="min-w-0 truncate text-navy">{{ fine.event?.title ?? 'Event' }}</span>
              <span class="shrink-0 text-xs text-slate">
                {{ fine.kind === 'absent' ? 'Absence' : 'Late' }} · {{ fine.status }}
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
      <div class="rounded-xl border border-gold/30 bg-paper-panel p-4 text-sm text-navy">
        An officer records your attendance by scanning your QR code at the venue. Pick the event below to show it,
        then sign on your phone when asked.
      </div>

      <Card v-if="myAttendance">
        <CardContent class="p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-wide text-slate">
              My attendance
            </div>
            <div class="flex flex-wrap items-center gap-4 text-sm">
              <span class="text-slate">Attended <span class="font-mono font-semibold text-navy">{{ myAttendance.attended }}</span> of {{ myAttendance.events }}</span>
              <span class="text-slate">Rate <span class="font-mono font-semibold text-navy">{{ Math.round(myAttendance.rate * 100) }}%</span></span>
              <span class="text-slate">Signed <span class="font-mono font-semibold text-navy">{{ Math.round(myAttendance.signatures.rate * 100) }}%</span></span>
            </div>
          </div>
        </CardContent>
      </Card>

      <h2 class="text-lg font-semibold text-navy font-serif">
        Events
      </h2>
      <div v-if="events.events.length === 0" class="text-sm text-slate bg-paper-panel rounded-xl border border-line p-6 text-center">
        No events yet
      </div>
      <div v-if="registrationError" class="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
        {{ registrationError }}
      </div>
      <div v-else class="space-y-3">
        <Card
          v-for="event in events.events.slice(0, 8)"
          :key="event.id"
          class="hover:shadow-md transition-shadow"
        >
          <CardContent class="p-4 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="font-bold text-navy truncate">
                {{ event.title }}
              </div>
              <div class="text-xs text-slate">
                {{ new Date(event.date).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) }}
              </div>
            </div>
            <div v-if="portalField<boolean>(event, 'registrationRequired')" class="flex items-center gap-2 shrink-0">
              <Badge :variant="myRegistrations[event.id] ? (myRegistrations[event.id]!.status === 'registered' ? 'success' : 'warning') : 'default'">
                {{ registrationLabel(event) }}
              </Badge>
              <button
                class="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:bg-paper disabled:opacity-50"
                :disabled="registrationBusy === event.id"
                @click="toggleRegistration(event)"
              >
                {{ myRegistrations[event.id] ? 'Cancel' : 'Register' }}
              </button>
            </div>
            <Badge
              v-else
              variant="success"
              class="cursor-pointer"
              @click="router.push({ path: '/qr', query: { eventId: event.id } })"
            >
              Show my QR
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Quick Actions -->
    <div v-if="!auth.isStudent" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        v-if="auth.isClient || auth.isStaff"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/check-in')"
      >
        <CardContent class="p-4 text-center">
          <div class="text-2xl mb-1">
            📍
          </div>
          <div class="font-semibold text-navy text-sm">
            Check In
          </div>
          <div class="text-[10px] text-slate mt-0.5">
            Location or QR
          </div>
        </CardContent>
      </Card>

      <Card
        v-if="auth.isStaff"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/manage/events')"
      >
        <CardContent class="p-4 text-center">
          <div class="text-2xl mb-1">
            📅
          </div>
          <div class="font-semibold text-navy text-sm">
            Events
          </div>
          <div class="text-[10px] text-slate mt-0.5">
            Manage events
          </div>
        </CardContent>
      </Card>

      <Card
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/duty')"
      >
        <CardContent class="p-4 text-center">
          <div class="text-2xl mb-1">
            🏠
          </div>
          <div class="font-semibold text-navy text-sm">
            Office Duty
          </div>
          <div class="text-[10px] text-slate mt-0.5">
            Daily check-in
          </div>
        </CardContent>
      </Card>

      <Card
        v-if="auth.isStaff"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/scan')"
      >
        <CardContent class="p-4 text-center">
          <div class="text-2xl mb-1">
            📷
          </div>
          <div class="font-semibold text-navy text-sm">
            Scan QR
          </div>
          <div class="text-[10px] text-slate mt-0.5">
            Scan officer QR
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Duty Status (if has duty today) -->
    <div
      v-if="!auth.isStudent && dutyStore.hasDutyToday(auth.user?.id || '')"
      class="bg-paper-panel rounded-xl border border-gold/30 p-4 cursor-pointer hover:shadow-md transition-shadow"
      @click="router.push('/duty')"
    >
      <div class="flex items-center gap-3">
        <div class="w-2.5 h-2.5 rounded-full bg-gold shadow-[0_0_0_4px_rgba(201,162,75,0.15)]" />
        <div class="flex-1">
          <div class="text-xs text-gold-dark font-bold uppercase tracking-wider">
            Office Duty Today
          </div>
          <div class="font-bold text-navy">
            {{ dutyStore.getDutyForUser(auth.user?.id || '')?.startTime }} — {{ dutyStore.getDutyForUser(auth.user?.id || '')?.endTime }}
          </div>
        </div>
        <Badge :variant="dutyStore.isCheckedInForDuty(auth.user?.id || '') ? 'success' : 'warning'">
          {{ dutyStore.isCheckedInForDuty(auth.user?.id || '') ? 'Checked in' : 'Tap to check in' }}
        </Badge>
      </div>
    </div>

    <MyEventAccess v-if="!auth.isStudent" />

    <!-- Today's Events -->
    <div v-if="!auth.isStudent">
      <h2 class="text-lg font-semibold text-navy mb-4 font-serif">
        Today's Sessions
      </h2>
      <div v-if="todayEvents.length === 0" class="text-sm text-slate bg-paper-panel rounded-xl border border-line p-6 text-center">
        No events scheduled for today
      </div>
      <div v-else class="space-y-3">
        <Card
          v-for="event in todayEvents"
          :key="event.id"
          class="cursor-pointer hover:shadow-md transition-shadow"
          @click="auth.isStaff ? router.push(`/manage/events/${event.id}`) : router.push(`/check-in/${event.id}`)"
        >
          <CardContent class="p-4 flex items-center justify-between">
            <div>
              <div class="text-xs text-gold-dark font-bold uppercase tracking-wider">
                Today's session
              </div>
              <div class="font-bold text-navy">
                {{ event.title }}
              </div>
              <div class="text-xs text-slate">
                Starts {{ formatTime(event.date) }}
              </div>
            </div>
            <Badge variant="success">
              Active
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
