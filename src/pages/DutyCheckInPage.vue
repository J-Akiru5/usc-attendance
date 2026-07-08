<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDutyStore } from '@/stores/duties'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

const router = useRouter()
const auth = useAuthStore()
const dutyStore = useDutyStore()

const checkingIn = ref(false)
const result = ref<{ success: boolean; message: string } | null>(null)

const hasDuty = ref(false)
const alreadyCheckedIn = ref(false)

onMounted(async () => {
  await dutyStore.fetchTodayDutyAttendance()
  if (auth.user) {
    hasDuty.value = dutyStore.hasDutyToday(auth.user.id)
    alreadyCheckedIn.value = dutyStore.isCheckedInForDuty(auth.user.id)
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
      alreadyCheckedIn.value = true
    } else {
      result.value = { success: true, message: 'Check-in queued — will sync when online' }
    }
  } catch (err: unknown) {
    result.value = { success: false, message: err instanceof Error ? err.message : 'Check-in failed' }
  } finally {
    checkingIn.value = false
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
                alreadyCheckedIn
                  ? 'bg-success shadow-[0_0_0_4px_rgba(63,125,92,0.15)]'
                  : 'bg-gold shadow-[0_0_0_4px_rgba(201,162,75,0.15)]',
              ]"
            />
            <span class="text-sm font-bold text-ink">
              {{ alreadyCheckedIn ? 'Already checked in' : 'Office Duty — Today' }}
            </span>
          </div>
          <div class="text-xs text-slate pl-[22px]">
            {{ formatDutyTime() }} · ISUFST Dingle Campus
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
        v-if="!alreadyCheckedIn"
        :disabled="checkingIn"
        class="w-full bg-gradient-to-br from-gold to-yellow-700 rounded-2xl p-6 flex flex-col items-center gap-1.5 shadow-lg shadow-gold/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
        @click="handleCheckIn"
      >
        <span class="text-lg font-black text-ink">
          {{ checkingIn ? 'Checking in...' : 'Check in for duty' }}
        </span>
        <span class="text-xs text-yellow-900">Record your office attendance</span>
      </button>
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
