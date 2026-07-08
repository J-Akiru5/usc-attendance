<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useEventStore } from '@/stores/events'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import type { USCEvent } from '@/types'

const auth = useAuthStore()
const events = useEventStore()
const router = useRouter()
const todayEvents = ref<USCEvent[]>([])

onMounted(async () => {
  await events.fetchEvents()
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
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card
        v-if="auth.isClient || auth.isStaff"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/check-in')"
      >
        <CardContent class="p-6 text-center">
          <div class="text-3xl mb-2">📍</div>
          <div class="font-semibold text-navy">Check In</div>
          <div class="text-xs text-slate mt-1">Self check-in via location</div>
        </CardContent>
      </Card>

      <Card
        v-if="auth.isStaff"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push('/events')"
      >
        <CardContent class="p-6 text-center">
          <div class="text-3xl mb-2">📅</div>
          <div class="font-semibold text-navy">Events</div>
          <div class="text-xs text-slate mt-1">Manage events & attendance</div>
        </CardContent>
      </Card>

      <Card v-if="auth.isStaff">
        <CardContent class="p-6 text-center">
          <div class="text-3xl mb-2">📊</div>
          <div class="font-semibold text-navy">{{ events.events.length }}</div>
          <div class="text-xs text-slate mt-1">Total events</div>
        </CardContent>
      </Card>
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
