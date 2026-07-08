<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventStore } from '@/stores/events'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

const route = useRoute()
const router = useRouter()
const events = useEventStore()

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
    day: 'numeric',
  })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatCheckInTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

async function exportCSV() {
  const { supabase } = await import('@/lib/api')
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/attendance/export?eventId=${eventId.value}`, {
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${events.currentEvent?.title || 'attendance'}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
    <button @click="router.push('/events')" class="text-sm text-navy hover:underline">&larr; Back to events</button>

    <div v-if="events.loading" class="text-center text-slate py-12">Loading...</div>

    <template v-else-if="events.currentEvent">
      <!-- Event Header -->
      <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 md:p-8 text-white relative overflow-hidden">
        <div class="absolute -right-10 -top-10 w-40 h-40 border border-white/10 rounded-full" />
        <div class="text-xs tracking-widest uppercase text-gold-soft font-mono mb-2">Event</div>
        <h1 class="text-2xl md:text-3xl font-bold font-serif">{{ events.currentEvent.title }}</h1>
        <p class="text-white/60 text-sm mt-2">
          {{ formatDate(events.currentEvent.date) }} · {{ formatTime(events.currentEvent.date) }}
        </p>
        <p class="text-white/40 text-xs mt-1">
          Location: {{ events.currentEvent.lat.toFixed(4) }}, {{ events.currentEvent.lng.toFixed(4) }} · Radius: {{ events.currentEvent.radiusMeters }}m
        </p>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 flex-wrap">
        <Button variant="gold" @click="router.push(`/check-in/${eventId}`)">
          Check In
        </Button>
        <Button variant="outline" @click="exportCSV">
          Export CSV
        </Button>
        <Button variant="outline" @click="router.push(`/attendance/${eventId}`)">
          Full List
        </Button>
      </div>

      <!-- Attendance Summary -->
      <Card>
        <CardContent class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-navy">Attendance</h2>
            <Badge variant="success">{{ events.attendance.length }} checked in</Badge>
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
                <div class="font-medium text-navy">{{ record.user?.name }}</div>
                <div class="text-xs text-slate">{{ record.user?.position }}</div>
              </div>
              <div class="text-right">
                <Badge :variant="methodBadgeVariant(record.method)">
                  {{ methodLabel(record.method) }}
                </Badge>
                <div class="text-xs text-slate mt-1">{{ formatCheckInTime(record.createdAt) }}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
