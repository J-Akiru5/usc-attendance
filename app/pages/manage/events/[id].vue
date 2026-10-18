<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventStore } from '@/stores/events'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import LocationPicker from '@/components/ui/LocationPicker.vue'
import { downloadAttendance, type ExportFormat } from '@/lib/download'
import EventAccessPanel from '@/components/EventAccessPanel.vue'
import CheckInWindowPanel from '@/components/CheckInWindowPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

const route = useRoute()
const router = useRouter()
const events = useEventStore()
const auth = useAuthStore()

const eventId = computed(() => route.params.id as string)

// Who is coming (plan §8.2): seats, queue and the list behind them.
interface RegistrationRow {
  id: string
  status: string
  createdAt: string
  promotedAt: string | null
  user: { id: string, name: string, email: string, studentProfile: { studentNo: string, yearLevel: number | null } | null }
}
interface Registrations {
  capacity: number | null
  registered: number
  waitlisted: number
  seatsLeft: number | null
  registrations: RegistrationRow[]
}
const registrations = ref<Registrations | null>(null)
const registrationsError = ref('')

// Required audience (plan §8.2) with the labels the API already resolved.
const audienceInfo = computed(() => {
  const row = events.currentEvent as unknown as {
    audienceType?: string | null
    audienceYearLevel?: number | null
    audienceCollege?: { code: string, name: string } | null
    audienceSection?: { name: string } | null
  } | null
  if (!row || !row.audienceType || row.audienceType === 'all') return null
  if (row.audienceType === 'college') return row.audienceCollege ? `For ${row.audienceCollege.code || row.audienceCollege.name}` : 'For one college'
  if (row.audienceType === 'yearLevel') return `For year ${row.audienceYearLevel ?? '?'}`
  return row.audienceSection ? `For ${row.audienceSection.name}` : 'For one section'
})

// Recurring series (plan §8.2): the master carries the rule, an instance links
// back to it. The caption reads "Instance 3 of 12".
const seriesInfo = computed(() => {
  const row = events.currentEvent as unknown as {
    id?: string
    seriesId?: string | null
    rrule?: string | null
    recurrenceIndex?: number | null
    series?: { id: string, date: string, rrule: string | null, _count: { occurrences: number } } | null
    _count?: { occurrences?: number }
  } | null
  if (!row) return null
  const total = row.series ? row.series._count.occurrences + 1 : (row._count?.occurrences ?? 0) + 1
  const rule = row.rrule ?? row.series?.rrule ?? null
  if (row.seriesId) {
    return { isSeries: true, caption: `Instance ${(row.recurrenceIndex ?? 0) + 1} of ${total}`, rule, masterId: row.seriesId }
  }
  if (row.rrule) {
    return { isSeries: true, caption: `Repeats — ${total} occurrences`, rule: row.rrule, masterId: row.id }
  }
  return null
})

async function loadRegistrations() {
  try {
    registrations.value = await api.get<Registrations>(`/events/${eventId.value}/registrations`)
  } catch (err: unknown) {
    registrationsError.value = err instanceof Error ? err.message : 'Could not load registrations'
  }
}

onMounted(() => {
  events.fetchEvent(eventId.value)
  events.fetchAttendance(eventId.value)
  void loadRegistrations()
})

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function formatCheckInTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
}

const exporting = ref<ExportFormat | null>(null)
const exportError = ref('')

async function exportAs(format: ExportFormat) {
  exportError.value = ''
  exporting.value = format
  try {
    await downloadAttendance(eventId.value, format, events.currentEvent?.title)
  } catch (err: unknown) {
    exportError.value = err instanceof Error ? err.message : 'Export failed'
  } finally {
    exporting.value = null
  }
}

function methodLabel(method: string) {
  if (method === 'self') return 'Self'
  if (method === 'qr') return 'QR'
  return 'Manual'
}

function methodBadgeVariant(method: string) {
  if (method === 'self') return 'success'
  if (method === 'qr') return 'default'
  return 'warning'
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <button class="text-sm text-navy hover:underline" @click="router.push('/manage/events')">
      &larr; Back to events
    </button>

    <div v-if="events.loading" class="text-center text-slate py-12">
      Loading...
    </div>

    <template v-else-if="events.currentEvent">
      <!-- Event Header -->
      <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 md:p-8 text-white relative overflow-hidden">
        <div class="absolute -right-10 -top-10 w-40 h-40 border border-white/10 rounded-full" />
        <div class="text-xs tracking-widest uppercase text-gold-soft font-mono mb-2">
          Event
        </div>
        <h1 class="text-2xl md:text-3xl font-bold font-serif">
          {{ events.currentEvent.title }}
        </h1>
        <p class="text-white/60 text-sm mt-2">
          {{ formatDate(events.currentEvent.date) }} · {{ formatTime(events.currentEvent.date) }}
        </p>
        <p v-if="seriesInfo" class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span class="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-gold-soft">
            {{ seriesInfo.caption }}
          </span>
          <span class="font-mono text-white/40">{{ seriesInfo.rule }}</span>
        </p>
        <p v-if="audienceInfo" class="mt-2 text-xs">
          <span class="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-gold-soft">
            {{ audienceInfo }}
          </span>
        </p>
        <p class="text-white/40 text-xs mt-1">
          Radius: {{ events.currentEvent.radiusMeters }}m
        </p>
      </div>

      <!-- Venue Map -->
      <Card>
        <CardContent class="p-4">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">
            Venue Location
          </div>
          <LocationPicker
            :model-lat="events.currentEvent.lat"
            :model-lng="events.currentEvent.lng"
            :radius-meters="events.currentEvent.radiusMeters"
            :readonly="true"
            height="220px"
          />
        </CardContent>
      </Card>

      <!-- Actions -->
      <div v-if="exportError" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        {{ exportError }}
      </div>
      <div class="flex gap-3 flex-wrap">
        <Button variant="gold" @click="router.push(`/check-in/${eventId}`)">
          Check In
        </Button>
        <Button variant="outline" :disabled="exporting !== null" @click="exportAs('pdf')">
          {{ exporting === 'pdf' ? 'Preparing…' : 'Export PDF' }}
        </Button>
        <Button variant="outline" :disabled="exporting !== null" @click="exportAs('xlsx')">
          {{ exporting === 'xlsx' ? 'Preparing…' : 'Export Excel' }}
        </Button>
        <Button variant="outline" :disabled="exporting !== null" @click="exportAs('csv')">
          {{ exporting === 'csv' ? 'Preparing…' : 'Export CSV' }}
        </Button>
        <Button variant="outline" @click="router.push(`/attendance/${eventId}`)">
          Full List
        </Button>
      </div>

      <CheckInWindowPanel
        v-if="auth.canManageSettings"
        :event-id="eventId"
        :opens-at="events.currentEvent.checkInOpensAt"
        :closes-at="events.currentEvent.checkInClosesAt"
      />

      <EventAccessPanel
        v-if="auth.user?.canDelegate || auth.isSuperAdmin"
        :event-id="eventId"
        :can-grant="!!auth.user?.canDelegate"
      />

      <!-- Registrations (plan §8.2) -->
      <Card>
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="font-semibold text-navy">
              Registrations
            </div>
            <div v-if="registrations" class="text-xs text-slate">
              <span class="font-mono">{{ registrations.registered }}</span> registered ·
              <span class="font-mono">{{ registrations.waitlisted }}</span> waitlisted ·
              <span v-if="registrations.capacity !== null">
                capacity <span class="font-mono">{{ registrations.capacity }}</span>
              </span>
              <span v-else>no capacity limit</span>
            </div>
          </div>

          <div v-if="registrationsError" class="text-sm text-danger">
            {{ registrationsError }}
          </div>
          <div v-else-if="!registrations" class="text-sm text-slate">
            Loading…
          </div>
          <div v-else-if="registrations.registrations.length === 0" class="text-sm text-slate">
            Nobody has registered yet.
          </div>
          <ul v-else class="divide-y divide-line text-sm">
            <li
              v-for="row in registrations.registrations"
              :key="row.id"
              class="flex items-center justify-between gap-3 py-2"
            >
              <span class="min-w-0">
                <span class="font-medium text-navy">{{ row.user.name }}</span>
                <span v-if="row.user.studentProfile" class="ml-2 font-mono text-xs text-slate">{{ row.user.studentProfile.studentNo }}</span>
              </span>
              <span class="flex items-center gap-2">
                <Badge :variant="row.status === 'registered' ? 'success' : 'warning'">
                  {{ row.status === 'registered' ? 'Seat' : 'Waitlist' }}
                </Badge>
                <span v-if="row.promotedAt" class="text-[10px] text-slate">promoted</span>
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <!-- Attendance Summary -->
      <Card>
        <CardContent class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-navy">
              Attendance
            </h2>
            <Badge variant="success">
              {{ events.attendance.length }} checked in
            </Badge>
          </div>

          <div v-if="events.attendance.length === 0" class="text-sm text-slate text-center py-8">
            No attendance records yet
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="record in events.attendance"
              :key="record.id"
              class="flex items-center justify-between py-2 border-b border-line last:border-b-0"
            >
              <div>
                <div class="font-medium text-navy">
                  {{ record.user?.name }}
                </div>
                <div class="text-xs text-slate">
                  {{ record.user?.position }}
                </div>
              </div>
              <div class="text-right">
                <Badge :variant="methodBadgeVariant(record.method)">
                  {{ methodLabel(record.method) }}
                </Badge>
                <div class="text-xs text-slate mt-1">
                  <div>In: {{ formatCheckInTime(record.createdAt) }}</div>
                  <div v-if="record.checkOutAt" class="text-success font-medium">
                    Out: {{ formatCheckInTime(record.checkOutAt) }}
                  </div>
                  <div v-else class="text-slate">
                    Out: —
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
