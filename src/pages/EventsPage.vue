<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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

const events = useEventStore()
const auth = useAuthStore()
const router = useRouter()
const showCreate = ref(false)

const form = ref({
  title: '',
  date: '',
  time: '',
  lat: '',
  lng: '',
  radiusMeters: '50',
})

onMounted(() => {
  events.fetchEvents()
})

async function handleCreate() {
  const dateTime = `${form.value.date}T${form.value.time}:00`
  await events.createEvent({
    title: form.value.title,
    date: dateTime,
    lat: parseFloat(form.value.lat),
    lng: parseFloat(form.value.lng),
    radiusMeters: parseInt(form.value.radiusMeters),
  })
  showCreate.value = false
  form.value = { title: '', date: '', time: '', lat: '', lng: '', radiusMeters: '50' }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
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
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-navy font-serif">Events</h1>
        <p class="text-sm text-slate">Manage USC events and attendance</p>
      </div>
      <Button v-if="auth.isStaff" variant="gold" @click="showCreate = !showCreate">
        {{ showCreate ? 'Cancel' : '+ Create Event' }}
      </Button>
    </div>

    <!-- Create Event Form -->
    <Card v-if="showCreate">
      <CardHeader>
        <CardTitle>New Event</CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleCreate" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2 md:col-span-2">
            <Label>Event Title</Label>
            <Input v-model="form.title" placeholder="General Assembly — July Session" required />
          </div>
          <div class="space-y-2">
            <Label>Date</Label>
            <Input v-model="form.date" type="date" required />
          </div>
          <div class="space-y-2">
            <Label>Time</Label>
            <Input v-model="form.time" type="time" required />
          </div>
          <div class="space-y-2">
            <Label>Latitude</Label>
            <Input v-model="form.lat" type="number" step="any" placeholder="10.6895" required />
          </div>
          <div class="space-y-2">
            <Label>Longitude</Label>
            <Input v-model="form.lng" type="number" step="any" placeholder="122.9550" required />
          </div>
          <div class="space-y-2">
            <Label>Radius (meters)</Label>
            <Input v-model="form.radiusMeters" type="number" placeholder="50" />
          </div>
          <div class="flex items-end">
            <Button type="submit" variant="default" class="w-full">Create Event</Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Event List -->
    <div v-if="events.loading" class="text-center text-slate py-12">Loading events...</div>
    <div v-else-if="events.events.length === 0" class="text-center text-slate py-12">
      No events yet. Create one to get started.
    </div>
    <div v-else class="space-y-3">
      <Card
        v-for="event in events.events"
        :key="event.id"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push(`/events/${event.id}`)"
      >
        <CardContent class="p-4 flex items-center justify-between">
          <div>
            <div class="font-bold text-navy">{{ event.title }}</div>
            <div class="text-sm text-slate">
              {{ formatDate(event.date) }} · {{ formatTime(event.date) }}
            </div>
            <div class="text-xs text-slate mt-1">
              Radius: {{ event.radiusMeters }}m
            </div>
          </div>
          <div class="text-right">
            <Badge variant="default">{{ (event as any)._count?.attendance ?? 0 }} checked in</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
