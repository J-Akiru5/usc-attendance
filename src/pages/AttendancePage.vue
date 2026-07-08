<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventStore } from '@/stores/events'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

const route = useRoute()
const router = useRouter()
const events = useEventStore()
const auth = useAuthStore()

const eventId = computed(() => route.params.eventId as string)
const search = ref('')
const showManualOverride = ref(false)
const manualUserId = ref('')

const filteredAttendance = computed(() => {
  if (!search.value) return events.attendance
  const q = search.value.toLowerCase()
  return events.attendance.filter(
    (a) =>
      a.user?.name.toLowerCase().includes(q) ||
      a.user?.position.toLowerCase().includes(q)
  )
})

onMounted(() => {
  events.fetchEvent(eventId.value)
  events.fetchAttendance(eventId.value)
})

function formatTime(dateStr: string) {
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

async function handleManualOverride() {
  if (!manualUserId.value || !auth.user) return
  try {
    await events.manualCheckIn(eventId.value, manualUserId.value, auth.user.id)
    await events.fetchAttendance(eventId.value)
    manualUserId.value = ''
    showManualOverride.value = false
  } catch (err) {
    // Error handled by API
  }
}

function methodBadgeVariant(method: string) {
  if (method === 'self') return 'success'
  if (method === 'qr') return 'default'
  return 'warning'
}

function methodLabel(method: string) {
  if (method === 'self') return 'Self'
  if (method === 'qr') return 'QR'
  return 'Manual'
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <button @click="router.push(`/events/${eventId}`)" class="text-sm text-navy hover:underline">&larr; Back to event</button>

    <div v-if="events.loading" class="text-center text-slate py-12">Loading...</div>

    <template v-else-if="events.currentEvent">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 class="text-2xl font-bold text-navy font-serif">Attendance</h1>
          <p class="text-sm text-slate">{{ events.currentEvent.title }}</p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="exportCSV">Export CSV</Button>
          <Button v-if="auth.isStaff" variant="gold" size="sm" @click="showManualOverride = !showManualOverride">
            {{ showManualOverride ? 'Cancel' : 'Manual Override' }}
          </Button>
        </div>
      </div>

      <!-- Manual Override Form -->
      <Card v-if="showManualOverride">
        <CardHeader>
          <CardTitle>Manual Check-In</CardTitle>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="handleManualOverride" class="flex gap-3 items-end">
            <div class="flex-1 space-y-2">
              <Label>Officer User ID</Label>
              <Input v-model="manualUserId" placeholder="Enter officer user ID" required />
            </div>
            <Button type="submit" variant="default">Record</Button>
          </form>
        </CardContent>
      </Card>

      <!-- Search -->
      <div class="relative">
        <Input v-model="search" placeholder="Search by name or position..." class="pl-10" />
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate">🔍</span>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-4 gap-3">
        <Card>
          <CardContent class="p-4 text-center">
            <div class="text-2xl font-bold text-navy">{{ events.attendance.length }}</div>
            <div class="text-xs text-slate">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 text-center">
            <div class="text-2xl font-bold text-success">{{ events.attendance.filter(a => a.method === 'self').length }}</div>
            <div class="text-xs text-slate">Self</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 text-center">
            <div class="text-2xl font-bold text-navy">{{ events.attendance.filter(a => a.method === 'qr').length }}</div>
            <div class="text-xs text-slate">QR</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4 text-center">
            <div class="text-2xl font-bold text-gold-dark">{{ events.attendance.filter(a => a.method === 'manual').length }}</div>
            <div class="text-xs text-slate">Manual</div>
          </CardContent>
        </Card>
      </div>

      <!-- Attendance Table -->
      <Card>
        <CardContent class="p-0">
          <div v-if="filteredAttendance.length === 0" class="text-center text-slate py-12">
            {{ search ? 'No results found' : 'No attendance records yet' }}
          </div>
          <div v-else class="divide-y divide-line">
            <div
              v-for="record in filteredAttendance"
              :key="record.id"
              class="flex items-center justify-between px-5 py-3"
            >
              <div>
                <div class="font-medium text-navy">{{ record.user?.name }}</div>
                <div class="text-xs text-slate">{{ record.user?.position }}</div>
              </div>
              <div class="flex items-center gap-3">
                <Badge :variant="methodBadgeVariant(record.method)">
                  {{ methodLabel(record.method) }}
                </Badge>
                <div class="text-xs text-slate text-right min-w-[80px]">
                  {{ formatTime(record.createdAt) }}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
