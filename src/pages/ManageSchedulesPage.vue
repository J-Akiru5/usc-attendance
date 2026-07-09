<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useScheduleStore } from '@/stores/schedules'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import type { User } from '@/types'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

const schedules = useScheduleStore()
const auth = useAuthStore()

const users = ref<User[]>([])
const showForm = ref(false)
const editingId = ref<string | null>(null)
const deleteConfirmId = ref<string | null>(null)

const form = ref({
  userId: '',
  dayOfWeek: '1',
  startTime: '08:00',
  endTime: '17:00',
})

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const groupedSchedules = computed(() => {
  const groups: Record<number, typeof schedules.schedules> = {}
  for (const s of schedules.schedules) {
    if (!groups[s.dayOfWeek]) groups[s.dayOfWeek] = []
    groups[s.dayOfWeek].push(s)
  }
  return groups
})

onMounted(async () => {
  await Promise.all([
    schedules.fetchSchedules(),
    fetchUsers(),
  ])
})

async function fetchUsers() {
  try {
    users.value = await api.get<User[]>('/auth/users')
  } catch {
    // Fallback: extract users from schedules
    const userMap = new Map<string, User>()
    for (const s of schedules.schedules) {
      if (s.user) userMap.set(s.user.id, s.user)
    }
    users.value = Array.from(userMap.values())
  }
}

function startEdit(schedule: typeof schedules.schedules[0]) {
  editingId.value = schedule.id
  form.value = {
    userId: schedule.userId,
    dayOfWeek: String(schedule.dayOfWeek),
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  }
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  editingId.value = null
  form.value = { userId: '', dayOfWeek: '1', startTime: '08:00', endTime: '17:00' }
}

async function handleSubmit() {
  try {
    if (editingId.value) {
      await schedules.updateDutySchedule(editingId.value, {
        userId: form.value.userId,
        dayOfWeek: parseInt(form.value.dayOfWeek),
        startTime: form.value.startTime,
        endTime: form.value.endTime,
      })
    } else {
      await schedules.createDutySchedule({
        userId: form.value.userId,
        dayOfWeek: parseInt(form.value.dayOfWeek),
        startTime: form.value.startTime,
        endTime: form.value.endTime,
      })
    }
    cancelForm()
  } catch (err) {
    // Error handled by store
  }
}

async function handleDelete(id: string) {
  await schedules.deleteDutySchedule(id)
  deleteConfirmId.value = null
}

function getUserName(userId: string) {
  const user = users.value.find((u) => u.id === userId)
  return user?.name ?? userId
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-navy font-serif">Duty Schedules</h1>
        <p class="text-sm text-slate">Manage officer duty assignments</p>
      </div>
      <Button v-if="auth.isSuperAdmin" variant="gold" @click="showForm = !showForm">
        {{ showForm ? 'Cancel' : '+ Add Schedule' }}
      </Button>
    </div>

    <!-- Create/Edit Form -->
    <Card v-if="showForm">
      <CardHeader>
        <CardTitle>{{ editingId ? 'Edit Schedule' : 'New Schedule' }}</CardTitle>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>Officer</Label>
              <select
                v-model="form.userId"
                class="w-full border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
                required
              >
                <option value="" disabled>Select officer</option>
                <option v-for="user in users" :key="user.id" :value="user.id">
                  {{ user.name }} — {{ user.position }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <Label>Day of Week</Label>
              <select
                v-model="form.dayOfWeek"
                class="w-full border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
                required
              >
                <option v-for="(name, idx) in dayNames" :key="idx" :value="String(idx)">
                  {{ name }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <Label>Start Time</Label>
              <Input v-model="form.startTime" type="time" required />
            </div>
            <div class="space-y-2">
              <Label>End Time</Label>
              <Input v-model="form.endTime" type="time" required />
            </div>
          </div>
          <div class="flex gap-2">
            <Button type="submit" variant="default">{{ editingId ? 'Update' : 'Create' }}</Button>
            <Button type="button" variant="outline" @click="cancelForm">Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Schedule List -->
    <div v-if="schedules.loading" class="text-center text-slate py-12">Loading schedules...</div>
    <div v-else-if="schedules.schedules.length === 0" class="text-center text-slate py-12">
      No duty schedules yet. Create one to get started.
    </div>
    <template v-else>
      <div v-for="day in [1, 2, 3, 4, 5, 6, 0]" :key="day">
        <div v-if="groupedSchedules[day]?.length" class="mb-6">
          <h2 class="text-sm font-bold text-navy uppercase tracking-wider mb-3">{{ dayNames[day] }}</h2>
          <div class="space-y-2">
            <Card v-for="schedule in groupedSchedules[day]" :key="schedule.id">
              <CardContent class="p-4 flex items-center justify-between">
                <div>
                  <div class="font-medium text-navy">{{ schedule.user?.name ?? getUserName(schedule.userId) }}</div>
                  <div class="text-xs text-slate">{{ schedule.user?.position }}</div>
                  <div class="text-xs text-slate mt-1">
                    {{ schedule.startTime }} — {{ schedule.endTime }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <Badge :variant="schedule.active ? 'success' : 'default'">
                    {{ schedule.active ? 'Active' : 'Inactive' }}
                  </Badge>
                  <template v-if="auth.isSuperAdmin">
                    <button
                      class="text-xs text-navy font-bold hover:underline"
                      @click="startEdit(schedule)"
                    >
                      Edit
                    </button>
                    <template v-if="deleteConfirmId === schedule.id">
                      <button
                        class="text-xs text-danger font-bold hover:underline"
                        @click="handleDelete(schedule.id)"
                      >
                        Confirm
                      </button>
                      <button
                        class="text-xs text-slate font-bold hover:underline"
                        @click="deleteConfirmId = null"
                      >
                        Cancel
                      </button>
                    </template>
                    <button
                      v-else
                      class="text-xs text-danger font-bold hover:underline"
                      @click="deleteConfirmId = schedule.id"
                    >
                      Delete
                    </button>
                  </template>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
