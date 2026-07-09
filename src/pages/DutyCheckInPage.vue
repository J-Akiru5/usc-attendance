<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDutyStore } from '@/stores/duties'
import { api } from '@/lib/api'
import type { OrgProfile } from '@/types'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

const router = useRouter()
const auth = useAuthStore()
const dutyStore = useDutyStore()

const checkingIn = ref(false)
const checkingOut = ref(false)
const result = ref<{ success: boolean; message: string } | null>(null)

const hasDuty = ref(false)
const isCheckedIn = ref(false)
const isCheckedOut = ref(false)
const orgProfile = ref<OrgProfile | null>(null)
const checkInTime = ref<string | null>(null)
const checkOutTime = ref<string | null>(null)

onMounted(async () => {
  await dutyStore.fetchTodayDutyAttendance()
  if (auth.user) {
    hasDuty.value = dutyStore.hasDutyToday(auth.user.id)
    isCheckedIn.value = dutyStore.isCheckedInForDuty(auth.user.id)
    isCheckedOut.value = dutyStore.isCheckedOutForDuty(auth.user.id)

    const today = new Date().toISOString().split('T')[0]
    const record = dutyStore.dutyAttendance.find(
      (a) => a.userId === auth.user!.id && a.dutyDate?.startsWith(today)
    )
    if (record) {
      checkInTime.value = record.createdAt
      checkOutTime.value = record.checkOutAt
    }
  }

  try {
    orgProfile.value = await api.get<OrgProfile>('/org-profile')
  } catch {
    // Fallback defaults
    orgProfile.value = { id: '', dutyCheckInCutoff: '12:00', dutyCheckOutStart: '12:00' }
  }
})

async function handleCheckIn() {
  if (!auth.user) return

  checkingIn.value = true
  result.value = null

  try {
    if (navigator.onLine) {
      await dutyStore.checkInDuty(auth.user.id)
      result.value = { success: true, message: 'Duty check-in successful!' }
      isCheckedIn.value = true
      await dutyStore.fetchTodayDutyAttendance()
      const today = new Date().toISOString().split('T')[0]
      const record = dutyStore.dutyAttendance.find(
        (a) => a.userId === auth.user!.id && a.dutyDate?.startsWith(today)
      )
      if (record) {
        checkInTime.value = record.createdAt
      }
    } else {
      result.value = { success: true, message: 'Check-in queued — will sync when online' }
    }
  } catch (err: unknown) {
    result.value = { success: false, message: err instanceof Error ? err.message : 'Check-in failed' }
  } finally {
    checkingIn.value = false
  }
}

async function handleCheckOut() {
  if (!auth.user) return

  checkingOut.value = true
  result.value = null

  try {
    await dutyStore.checkOutDuty(auth.user.id)
    result.value = { success: true, message: 'Duty check-out successful!' }
    isCheckedOut.value = true
    await dutyStore.fetchTodayDutyAttendance()
    const today = new Date().toISOString().split('T')[0]
    const record = dutyStore.dutyAttendance.find(
      (a) => a.userId === auth.user!.id && a.dutyDate?.startsWith(today)
    )
    if (record) {
      checkOutTime.value = record.checkOutAt
    }
  } catch (err: unknown) {
    result.value = { success: false, message: err instanceof Error ? err.message : 'Check-out failed' }
  } finally {
    checkingOut.value = false
  }
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDutyTime() {
  const duty = dutyStore.getDutyForUser(auth.user?.id || '')
  if (!duty) return ''
  return `${duty.startTime} — ${duty.endTime}`
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
</script>

<template>
  <div class="max-w-md mx-auto space-y-5">
    <!-- Header -->
    <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 text-white relative overflow-hidden">
      <div class="absolute -right-8 -top-8 w-32 h-32 border border-white/10 rounded-full" />
      <div class="absolute right-2 top-2 w-20 h-20 border border-white/10 rounded-full" />

      <div class="flex items-center justify-between mb-4">
        <div class="w-10 h-10 rounded-full bg-navy border-2 border-gold flex items-center justify-center text-gold font-bold text-xs">
          USC
        </div>
      </div>

      <div class="text-xs tracking-widest uppercase text-gold font-bold mb-1">USC Attendance</div>
      <h1 class="text-2xl font-bold">{{ getGreeting() }},<br />{{ auth.user?.name }}</h1>
      <p class="text-white/50 text-sm mt-1">{{ auth.user?.position }}</p>
    </div>

    <!-- No duty today -->
    <Card v-if="!hasDuty">
      <CardContent class="p-6 text-center">
        <div class="text-3xl mb-2">🏠</div>
        <div class="font-bold text-navy">No office duty today</div>
        <div class="text-xs text-slate mt-1">You're not scheduled for duty on {{ dayNames[new Date().getDay()] }}</div>
      </CardContent>
    </Card>

    <!-- Duty card -->
    <template v-else>
      <Card>
        <CardContent class="p-5">
          <div class="flex items-center gap-3 mb-3">
            <div
              :class="[
                'w-2.5 h-2.5 rounded-full',
                isCheckedOut
                  ? 'bg-success shadow-[0_0_0_4px_rgba(63,125,92,0.15)]'
                  : isCheckedIn
                    ? 'bg-gold shadow-[0_0_0_4px_rgba(201,162,75,0.15)]'
                    : 'bg-gold shadow-[0_0_0_4px_rgba(201,162,75,0.15)]',
              ]"
            />
            <span class="text-sm font-bold text-ink">
              {{ isCheckedOut ? 'Duty complete' : isCheckedIn ? 'Checked in — duty in progress' : 'Office Duty — Today' }}
            </span>
          </div>
          <div class="text-xs text-slate pl-[22px]">
            {{ formatDutyTime() }} · ISUFST Dingle Campus
          </div>

          <!-- Time-window info -->
          <div v-if="orgProfile" class="mt-3 pl-[22px] text-[11px] text-slate space-y-0.5">
            <div>Check-in window: before {{ orgProfile.dutyCheckInCutoff }}</div>
            <div>Check-out window: from {{ orgProfile.dutyCheckOutStart }}</div>
          </div>

          <!-- Timestamps -->
          <div v-if="checkInTime" class="mt-3 pl-[22px] text-xs text-slate">
            <div>Check-in: {{ formatTime(checkInTime) }}</div>
            <div v-if="checkOutTime">Check-out: {{ formatTime(checkOutTime) }}</div>
          </div>
        </CardContent>
      </Card>

      <!-- Result -->
      <div
        v-if="result"
        :class="[
          'rounded-xl border-l-4 px-4 py-3 text-sm font-medium',
          result.success
            ? 'border-success bg-success/10 text-success'
            : 'border-danger bg-danger/10 text-danger',
        ]"
      >
        {{ result.message }}
      </div>

      <!-- Check In Button -->
      <button
        v-if="!isCheckedIn"
        :disabled="checkingIn"
        class="w-full bg-gradient-to-br from-gold to-yellow-700 rounded-2xl p-6 flex flex-col items-center gap-1.5 shadow-lg shadow-gold/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
        @click="handleCheckIn"
      >
        <span class="text-lg font-black text-ink">
          {{ checkingIn ? 'Checking in...' : 'Check in for duty' }}
        </span>
        <span class="text-xs text-yellow-900">Record your office attendance</span>
      </button>

      <!-- Check Out Button -->
      <button
        v-if="isCheckedIn && !isCheckedOut"
        :disabled="checkingOut"
        class="w-full bg-gradient-to-br from-navy to-navy-deep rounded-2xl p-6 flex flex-col items-center gap-1.5 shadow-lg shadow-navy/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
        @click="handleCheckOut"
      >
        <span class="text-lg font-black text-white">
          {{ checkingOut ? 'Checking out...' : 'Check Out' }}
        </span>
        <span class="text-xs text-white/60">End your duty session</span>
      </button>

      <!-- Complete badge -->
      <div v-if="isCheckedOut" class="text-center py-2">
        <Badge variant="success" class="text-base px-4 py-1">Duty complete</Badge>
      </div>
    </template>

    <!-- Actions -->
    <div class="flex gap-3">
      <button
        class="flex-1 text-center text-xs text-navy font-bold hover:underline py-2"
        @click="router.push('/check-in')"
      >
        Event check-in
      </button>
    </div>

    <!-- Bottom stamp -->
    <div class="bg-gold rounded-lg px-5 py-3 flex items-center justify-between text-xs font-bold">
      <span class="text-navy-deep">ISUFST · Dingle Campus</span>
      <span class="text-yellow-900">{{ new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }}</span>
    </div>
  </div>
</template>
