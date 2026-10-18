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

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

const route = useRoute()
const router = useRouter()
const events = useEventStore()
const auth = useAuthStore()

const eventId = computed(() => route.params.id as string)

onMounted(() => {
  events.fetchEvent(eventId.value)
  events.fetchAttendance(eventId.value)
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
