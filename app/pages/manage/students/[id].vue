<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

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
  finances: {
    fines: Array<{ id: string, kind: string, amountCentavos: number, status: string, issuedAt: string, paymentRef: string | null, waiveReason: string | null, event: { id: string, title: string } | null }>
    unpaidCentavos: number
    unpaidPesos: string
    cleared: boolean
    payments: Array<{ id: string, amountCentavos: number, method: string, reference: string, receivedAt: string }>
    clearance: { id: string, code: string, issuedAt: string, coveredCentavos: number, revokedAt: string | null } | null
  }
  history: Array<{ eventId: string | null, title: string, date: string | null, method: string, at: string, signed: boolean }>
}

const route = useRoute()
const studentId = computed(() => route.params.id as string)

const data = ref<Student360 | null>(null)
const loading = ref(true)
const error = ref('')

// Money handling (plan §8.5): recording a settlement and issuing/revoking a
// certificate, from the student's own page.
const payFor = ref<string | null>(null)
const payment = ref({ method: 'cash', reference: '' })
const moneyBusy = ref(false)
const moneyNotice = ref('')
const moneyError = ref('')

const peso = (centavos: number) => `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function reload() {
  data.value = await api.get<Student360>(`/analytics/students/${studentId.value}`)
}

async function recordPayment(fineId: string) {
  moneyBusy.value = true
  moneyNotice.value = ''
  moneyError.value = ''
  try {
    const result = await api.post<{ account: { unpaidPesos: string, cleared: boolean } }>(`/fines/${fineId}/payment`, {
      method: payment.value.method,
      reference: payment.value.reference.trim()
    })
    moneyNotice.value = result.account.cleared
      ? 'Settled — the student is now cleared.'
      : `Settled. ${result.account.unpaidPesos} still outstanding.`
    payFor.value = null
    payment.value = { method: 'cash', reference: '' }
    await reload()
  } catch (err: unknown) {
    moneyError.value = err instanceof Error ? err.message : 'Could not record the payment'
  } finally {
    moneyBusy.value = false
  }
}

async function issueClearance() {
  moneyBusy.value = true
  moneyNotice.value = ''
  moneyError.value = ''
  try {
    await api.post('/clearance/issue', { userId: studentId.value })
    moneyNotice.value = 'Clearance issued.'
    await reload()
  } catch (err: unknown) {
    moneyError.value = err instanceof Error ? err.message : 'Could not issue the clearance'
  } finally {
    moneyBusy.value = false
  }
}

async function revokeClearance() {
  const clearanceId = data.value?.finances.clearance?.id
  if (!clearanceId) return
  moneyBusy.value = true
  moneyNotice.value = ''
  moneyError.value = ''
  try {
    await api.post('/clearance/revoke', { clearanceId })
    moneyNotice.value = 'Clearance revoked.'
    await reload()
  } catch (err: unknown) {
    moneyError.value = err instanceof Error ? err.message : 'Could not revoke it'
  } finally {
    moneyBusy.value = false
  }
}

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

      <!-- Money (plan §8.5): fines, payments and the clearance certificate -->
      <Card>
        <CardContent class="p-6 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="font-semibold text-navy font-serif">
              Fines &amp; clearance
            </div>
            <div class="flex items-center gap-2">
              <Badge :variant="data.finances.cleared ? 'success' : 'warning'">
                {{ data.finances.cleared ? 'Cleared' : `${data.finances.unpaidPesos} unpaid` }}
              </Badge>
              <button
                v-if="data.finances.cleared && !data.finances.clearance"
                class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                :disabled="moneyBusy"
                @click="issueClearance"
              >
                Issue clearance
              </button>
            </div>
          </div>

          <div v-if="moneyError" class="text-sm text-danger">
            {{ moneyError }}
          </div>
          <div v-if="moneyNotice" class="text-sm text-success">
            {{ moneyNotice }}
          </div>

          <div v-if="data.finances.clearance" class="rounded-lg border border-line bg-paper p-3 space-y-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-mono font-bold tracking-widest text-navy">{{ data.finances.clearance.code }}</span>
              <span class="flex items-center gap-2">
                <NuxtLink :to="`/verify/${data.finances.clearance.code}`" target="_blank" class="text-xs font-semibold text-navy hover:underline">
                  Verify page
                </NuxtLink>
                <button
                  v-if="!data.finances.clearance.revokedAt"
                  class="text-xs text-danger hover:underline disabled:opacity-50"
                  :disabled="moneyBusy"
                  @click="revokeClearance"
                >
                  Revoke
                </button>
                <span v-else class="text-xs text-slate">revoked</span>
              </span>
            </div>
            <div class="text-xs text-slate">
              Issued {{ new Date(data.finances.clearance.issuedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }) }}
            </div>
          </div>

          <div v-if="data.finances.fines.length === 0" class="text-sm text-slate">
            No fines recorded.
          </div>
          <ul v-else class="divide-y divide-line text-sm">
            <li v-for="fine in data.finances.fines" :key="fine.id" class="py-2 space-y-1">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="min-w-0">
                  <span class="font-medium text-navy">{{ fine.event?.title ?? 'Event' }}</span>
                  <span class="ml-2 text-xs text-slate">{{ fine.kind === 'absent' ? 'Absence' : 'Late' }}</span>
                  <Badge :variant="fine.status === 'unpaid' ? 'warning' : 'success'" class="ml-2">{{ fine.status }}</Badge>
                </span>
                <span class="flex items-center gap-2">
                  <span class="font-mono text-navy">{{ peso(fine.amountCentavos) }}</span>
                  <button
                    v-if="fine.status === 'unpaid'"
                    class="text-xs font-semibold text-navy hover:underline"
                    @click="payFor = payFor === fine.id ? null : fine.id"
                  >
                    Record payment
                  </button>
                </span>
              </div>
              <div v-if="payFor === fine.id" class="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-paper p-3">
                <div class="space-y-1">
                  <Label>Method</Label>
                  <select v-model="payment.method" class="rounded-lg border border-line px-3 py-2 text-sm">
                    <option value="cash">
                      Cash
                    </option>
                    <option value="gcash">
                      GCash
                    </option>
                  </select>
                </div>
                <div class="space-y-1">
                  <Label>{{ payment.method === 'cash' ? 'OR number' : 'GCash reference' }}</Label>
                  <Input v-model="payment.reference" class="w-44" placeholder="OR-2026-00123" />
                </div>
                <button
                  class="rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  :disabled="moneyBusy || payment.reference.trim().length < 3"
                  @click="recordPayment(fine.id)"
                >
                  {{ moneyBusy ? 'Saving…' : `Settle ${peso(fine.amountCentavos)}` }}
                </button>
              </div>
            </li>
          </ul>

          <div v-if="data.finances.payments.length > 0" class="pt-1">
            <div class="text-xs uppercase tracking-wide text-slate mb-1">
              Payments
            </div>
            <ul class="divide-y divide-line text-xs">
              <li v-for="row in data.finances.payments" :key="row.id" class="flex items-center justify-between gap-2 py-1.5">
                <span class="font-mono text-navy">{{ row.reference }}</span>
                <span class="text-slate">{{ row.method }} · {{ formatDateTime(row.receivedAt) }}</span>
                <span class="font-mono text-navy">{{ peso(row.amountCentavos) }}</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

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
