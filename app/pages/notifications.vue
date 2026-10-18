<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true })

interface Notification {
  id: string
  kind: string
  title: string
  body: string
  link: string | null
  readAt: string | null
  createdAt: string
  creator: { id: string, name: string } | null
}

const notifications = ref<Notification[]>([])
const unread = ref(0)
const loading = ref(true)
const error = ref('')
const busy = ref(false)

const preferences = ref({ inApp: true, email: true, push: false })
const preferencesSaved = ref(false)

const kindLabels: Record<string, string> = {
  registration_confirmed: 'Registration',
  waitlist_joined: 'Waitlist',
  waitlist_promoted: 'Waitlist',
  event_reminder: 'Reminder',
  announcement: 'Announcement'
}

const hasUnread = computed(() => unread.value > 0)

function formatWhen(value: string) {
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [inbox, prefs] = await Promise.all([
      api.get<{ unread: number, notifications: Notification[] }>('/notifications?limit=50'),
      api.get<{ preferences: { inApp: boolean, email: boolean, push: boolean } }>('/notifications/preferences')
    ])
    notifications.value = inbox.notifications ?? []
    unread.value = inbox.unread ?? 0
    preferences.value = prefs.preferences ?? preferences.value
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load your notifications'
  } finally {
    loading.value = false
  }
}

async function markAllRead() {
  if (!hasUnread.value || busy.value) return
  busy.value = true
  try {
    await api.post('/notifications/read', { all: true })
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not mark them read'
  } finally {
    busy.value = false
  }
}

async function markRead(notification: Notification) {
  if (notification.readAt) return
  try {
    await api.post('/notifications/read', { ids: [notification.id] })
    notification.readAt = new Date().toISOString()
    unread.value = Math.max(0, unread.value - 1)
  } catch {
    // Leaving it unread is the safe failure.
  }
}

async function savePreferences() {
  preferencesSaved.value = false
  try {
    const saved = await api.put<{ preferences: { inApp: boolean, email: boolean, push: boolean } }>('/notifications/preferences', preferences.value)
    preferences.value = saved.preferences ?? preferences.value
    preferencesSaved.value = true
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not save your preferences'
  }
}

onMounted(load)
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-navy font-serif">
          Notifications
        </h1>
        <p class="text-sm text-slate mt-1">
          Reminders, registration news and announcements from the council.
        </p>
      </div>
      <button
        class="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:bg-paper disabled:opacity-50"
        :disabled="!hasUnread || busy"
        @click="markAllRead"
      >
        {{ busy ? 'Marking…' : `Mark all read${hasUnread ? ` (${unread})` : ''}` }}
      </button>
    </div>

    <div v-if="error" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>

    <!-- Preferences -->
    <Card>
      <CardContent class="p-4 space-y-3">
        <div class="text-xs font-bold uppercase tracking-wide text-slate">
          How you hear from us
        </div>
        <label class="flex items-center justify-between gap-3 text-sm">
          <span class="text-navy">In-app inbox</span>
          <input
            v-model="preferences.inApp"
            type="checkbox"
            class="h-4 w-4"
            :disabled="true"
            title="The inbox always keeps a record"
          >
        </label>
        <label class="flex items-center justify-between gap-3 text-sm">
          <span class="text-navy">Email</span>
          <input v-model="preferences.email" type="checkbox" class="h-4 w-4">
        </label>
        <label class="flex items-center justify-between gap-3 text-sm">
          <span class="text-navy">
            Push <span class="text-xs text-slate">(coming with the installable app)</span>
          </span>
          <input
            v-model="preferences.push"
            type="checkbox"
            class="h-4 w-4"
            :disabled="true"
          >
        </label>
        <div class="flex items-center gap-3">
          <button
            class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            @click="savePreferences"
          >
            Save preferences
          </button>
          <span v-if="preferencesSaved" class="text-xs text-success">Saved.</span>
        </div>
      </CardContent>
    </Card>

    <!-- Inbox -->
    <div v-if="loading" class="text-center text-slate py-12">
      Loading your inbox...
    </div>
    <div v-else-if="notifications.length === 0" class="text-center text-slate py-12">
      Nothing yet — reminders and announcements will appear here.
    </div>
    <div v-else class="space-y-2">
      <Card
        v-for="notification in notifications"
        :key="notification.id"
        :class="notification.readAt ? 'opacity-70' : 'border-l-4 border-l-gold'"
      >
        <CardContent class="p-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <Badge variant="default">
                  {{ kindLabels[notification.kind] ?? notification.kind }}
                </Badge>
                <span v-if="!notification.readAt" class="text-[10px] font-bold uppercase text-danger">New</span>
              </div>
              <div class="font-semibold text-navy mt-1">
                {{ notification.title }}
              </div>
              <p class="text-sm text-slate mt-0.5">
                {{ notification.body }}
              </p>
            </div>
            <div class="text-right text-xs text-slate shrink-0">
              <div>{{ formatWhen(notification.createdAt) }}</div>
              <div v-if="notification.creator">
                by {{ notification.creator.name }}
              </div>
            </div>
          </div>
          <div class="mt-2 flex items-center gap-3">
            <NuxtLink
              v-if="notification.link"
              :to="notification.link"
              class="text-xs font-semibold text-navy hover:underline"
              @click="markRead(notification)"
            >
              Open
            </NuxtLink>
            <button v-if="!notification.readAt" class="text-xs text-slate hover:underline" @click="markRead(notification)">
              Mark read
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
