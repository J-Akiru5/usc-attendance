<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEventStore } from '@/stores/events'
import { useDutyStore } from '@/stores/duties'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import type { USCEvent } from '@/types'

const auth = useAuthStore()
const events = useEventStore()
const dutyStore = useDutyStore()
const router = useRouter()
const todayEvents = ref<USCEvent[]>([])

onMounted(async () => {
  await Promise.all([
    events.fetchEvents(),
    dutyStore.fetchTodayDutyAttendance(),
  ])
  const today = new Date().toISOString().split('T')[0]
  todayEvents.value = events.events.filter((e) => e.date.startsWith(today))
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
    hour12: true,
  })
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Greeting Header (matches mockup) -->
    <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 md:p-8 text-white relative overflow-hidden">
      <div class="absolute -right-10 -top-10 w-40 h-40 border border-white/10 rounded-full" />
      <div class="absolute right-5 top-5 w-24 h-24 border border-white/10 rounded-full" />

      <div class="text-xs tracking-widest uppercase text-gold-soft font-mono mb-2">USC Attendance</div>
      <h1 class="text-2xl md:text-3xl font-bold font-serif">{{ getGreeting() }},<br />{{ auth.user?.name }}</h1>
      <p class="text-white/60 text-sm mt-1">{{ auth.user?.position }}</p>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card
        v-if="auth.isClient || auth.isStaff"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/check-in')"
      >
        <CardContent class="p-4 text-center">
          <div class="text-2xl mb-1">📍</div>
          <div class="font-semibold text-navy text-sm">Check In</div>
          <div class="text-[10px] text-slate mt-0.5">Location or QR</div>
        </CardContent>
      </Card>

      <Card
        v-if="auth.isStaff"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/events')"
      >
        <CardContent class="p-4 text-center">
          <div class="text-2xl mb-1">📅</div>
          <div class="font-semibold text-navy text-sm">Events</div>
          <div class="text-[10px] text-slate mt-0.5">Manage events</div>
        </CardContent>
      </Card>

      <Card
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/duty')"
      >
        <CardContent class="p-4 text-center">
          <div class="text-2xl mb-1">🏠</div>
          <div class="font-semibold text-navy text-sm">Office Duty</div>
          <div class="text-[10px] text-slate mt-0.5">Daily check-in</div>
        </CardContent>
      </Card>

      <Card
        v-if="auth.isStaff"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/scan')"
      >
        <CardContent class="p-4 text-center">
          <div class="text-2xl mb-1">📷</div>
          <div class="font-semibold text-navy text-sm">Scan QR</div>
          <div class="text-[10px] text-slate mt-0.5">Scan officer QR</div>
        </CardContent>
      </Card>
    </div>

    <!-- Duty Status (if has duty today) -->
    <div
      v-if="dutyStore.hasDutyToday(auth.user?.id || '')"
      class="bg-paper-panel rounded-xl border border-gold/30 p-4 cursor-pointer hover:shadow-md transition-shadow"
      @click="router.push('/duty')"
    >
      <div class="flex items-center gap-3">
        <div class="w-2.5 h-2.5 rounded-full bg-gold shadow-[0_0_0_4px_rgba(201,162,75,0.15)]" />
        <div class="flex-1">
          <div class="text-xs text-gold-dark font-bold uppercase tracking-wider">Office Duty Today</div>
          <div class="font-bold text-navy">
            {{ dutyStore.getDutyForUser(auth.user?.id || '')?.startTime }} — {{ dutyStore.getDutyForUser(auth.user?.id || '')?.endTime }}
          </div>
        </div>
        <Badge :variant="dutyStore.isCheckedInForDuty(auth.user?.id || '') ? 'success' : 'warning'">
          {{ dutyStore.isCheckedInForDuty(auth.user?.id || '') ? 'Checked in' : 'Tap to check in' }}
        </Badge>
      </div>
    </div>

    <!-- Today's Events -->
    <div>
      <h2 class="text-lg font-semibold text-navy mb-4 font-serif">Today's Sessions</h2>
      <div v-if="todayEvents.length === 0" class="text-sm text-slate bg-paper-panel rounded-xl border border-line p-6 text-center">
        No events scheduled for today
      </div>
      <div v-else class="space-y-3">
        <Card
          v-for="event in todayEvents"
          :key="event.id"
          class="cursor-pointer hover:shadow-md transition-shadow"
          @click="auth.isStaff ? router.push(`/events/${event.id}`) : router.push(`/check-in/${event.id}`)"
        >
          <CardContent class="p-4 flex items-center justify-between">
            <div>
              <div class="text-xs text-gold-dark font-bold uppercase tracking-wider">Today's session</div>
              <div class="font-bold text-navy">{{ event.title }}</div>
              <div class="text-xs text-slate">Starts {{ formatTime(event.date) }}</div>
            </div>
            <Badge variant="success">Active</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
