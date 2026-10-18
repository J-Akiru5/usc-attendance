<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

interface Student360 {
  student: {
    id: string
    name: string
    email: string
    active: boolean
    studentNo: string | null
    yearLevel: number | null
    contactNumber: string | null
    college: { code: string, name: string } | null
    program: { code: string, name: string } | null
    section: string | null
  }
  semester: { id: string, name: string } | null
  summary: {
    events: number
    attended: number
    rate: number
    signatures: { signed: number, rate: number }
    methods: Array<{ method: string, count: number }>
    firstAt: string | null
    lastAt: string | null
  }
  history: Array<{ eventId: string | null, title: string, date: string | null, method: string, at: string, signed: boolean }>
}

const route = useRoute()
const studentId = computed(() => route.params.id as string)

const data = ref<Student360 | null>(null)
const loading = ref(true)
const error = ref('')

const percent = (value: number) => `${Math.round(value * 100)}%`

const methodLabels: Record<string, string> = { qr: 'QR scan', manual: 'Manual', barcode: 'ID barcode', self: 'Self check-in' }

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(async () => {
  try {
    data.value = await api.get<Student360>(`/analytics/students/${studentId.value}`)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load this student'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div v-if="loading" class="text-center text-slate py-12">
      Loading the student...
    </div>
    <div v-else-if="error" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>

    <template v-else-if="data">
      <!-- Header -->
      <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 text-white relative overflow-hidden">
        <div class="absolute -right-10 -top-10 w-40 h-40 border border-white/10 rounded-full" />
        <div class="text-xs tracking-widest uppercase text-gold font-bold mb-1">
          Student 360
        </div>
        <h1 class="text-2xl md:text-3xl font-bold font-serif">
          {{ data.student.name }}
        </h1>
        <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/60">
          <span v-if="data.student.studentNo" class="font-mono">{{ data.student.studentNo }}</span>
          <span v-if="data.student.yearLevel">Year {{ data.student.yearLevel }}</span>
          <span v-if="data.student.section">{{ data.student.section }}</span>
          <span v-if="data.student.college">{{ data.student.college.code || data.student.college.name }}</span>
          <span v-if="data.student.program">{{ data.student.program.code || data.student.program.name }}</span>
          <span v-if="!data.student.active" class="text-gold-soft font-semibold">Deactivated</span>
        </div>
        <p class="text-white/40 text-xs mt-2">
          {{ data.semester ? data.semester.name : 'All time' }}
        </p>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent class="p-4">
            <div class="text-xs uppercase tracking-wide text-slate">
              Attended
            </div>
            <div class="text-2xl font-bold text-navy font-serif">
              {{ data.summary.attended }}
            </div>
            <div class="text-xs text-slate mt-1">
              of {{ data.summary.events }} events
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4">
            <div class="text-xs uppercase tracking-wide text-slate">
              Rate
            </div>
            <div class="text-2xl font-bold text-navy font-serif">
              {{ percent(data.summary.rate) }}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4">
            <div class="text-xs uppercase tracking-wide text-slate">
              Signatures
            </div>
            <div class="text-2xl font-bold text-navy font-serif">
              {{ percent(data.summary.signatures.rate) }}
            </div>
            <div class="text-xs text-slate mt-1">
              {{ data.summary.signatures.signed }} signed
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4">
            <div class="text-xs uppercase tracking-wide text-slate">
              Last seen
            </div>
            <div class="text-sm font-semibold text-navy mt-1">
              {{ data.summary.lastAt ? formatDateTime(data.summary.lastAt) : 'Never' }}
            </div>
            <div class="text-xs text-slate mt-1">
              <span v-for="m in data.summary.methods" :key="m.method" class="mr-2">
                {{ methodLabels[m.method] ?? m.method }} ×{{ m.count }}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- History -->
      <Card>
        <CardContent class="p-6 space-y-3">
          <div class="font-semibold text-navy font-serif">
            Attendance history
          </div>
          <div v-if="data.history.length === 0" class="text-sm text-slate">
            No attendance recorded in this window.
          </div>
          <ul v-else class="divide-y divide-line text-sm">
            <li v-for="entry in data.history" :key="`${entry.eventId}-${entry.at}`" class="flex flex-wrap items-center justify-between gap-2 py-2">
              <span class="min-w-0">
                <NuxtLink v-if="entry.eventId" :to="`/manage/events/${entry.eventId}`" class="font-medium text-navy hover:underline">
                  {{ entry.title }}
                </NuxtLink>
                <span v-else class="font-medium text-navy">{{ entry.title }}</span>
                <span class="ml-2 text-xs text-slate">{{ formatDateTime(entry.at) }}</span>
              </span>
              <span class="flex items-center gap-2">
                <Badge variant="default">
                  {{ methodLabels[entry.method] ?? entry.method }}
                </Badge>
                <Badge :variant="entry.signed ? 'success' : 'warning'">
                  {{ entry.signed ? 'Signed' : 'No signature' }}
                </Badge>
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
