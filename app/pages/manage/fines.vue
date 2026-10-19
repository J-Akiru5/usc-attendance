<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

interface FineRow {
  id: string
  kind: 'absent' | 'late'
  amountCentavos: number
  status: 'unpaid' | 'paid' | 'waived'
  issuedAt: string
  paidAt: string | null
  paymentRef: string | null
  waiveReason: string | null
  user: { id: string, name: string, studentProfile: { studentNo: string, yearLevel: number | null } | null }
  event: { id: string, title: string, date: string }
}
interface Summary { count: number, unpaid: number, unpaidCentavos: number, unpaidPesos: string, paidCentavos: number, waived: number }

const auth = useAuthStore()
const fines = ref<FineRow[]>([])
const summary = ref<Summary | null>(null)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const statusFilter = ref('unpaid')
const busy = ref(false)

// The rules (managers only): rates in pesos, converted to centavos on save.
const rule = ref({ absentPesos: '50', latePesos: '25', lateAfterMinutes: '30' })

const peso = (centavos: number) => `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusVariants: Record<string, 'default' | 'success' | 'warning'> = {
  unpaid: 'warning',
  paid: 'success',
  waived: 'default'
}

// Excuse review queue (plan §8.5).
interface ExcuseRow {
  id: string
  category: string
  reason: string
  hasAttachment: boolean
  student: { id: string, name: string, studentProfile: { studentNo: string } | null }
  fine: { id: string, kind: string, amountCentavos: number, event: { id: string, title: string } }
}
const excuses = ref<ExcuseRow[]>([])

async function loadExcuses() {
  try {
    const data = await api.get<{ excuses: ExcuseRow[] }>('/excuses?status=pending')
    excuses.value = data.excuses ?? []
  } catch {
    excuses.value = []
  }
}

async function reviewExcuse(row: ExcuseRow, decision: 'approve' | 'deny') {
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    const result = await api.post<{ fineStatus: string }>(`/excuses/${row.id}/review`, { decision })
    notice.value = decision === 'approve'
      ? `Approved — the ${peso(row.fine.amountCentavos)} fine for ${row.student.name} is now ${result.fineStatus}.`
      : `Denied — ${row.student.name}'s fine stays unpaid.`
    await Promise.all([load(), loadExcuses()])
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not record the decision'
  } finally {
    busy.value = false
  }
}

const visible = computed(() => statusFilter.value ? fines.value.filter(f => f.status === statusFilter.value) : fines.value)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const query = statusFilter.value ? `?status=${statusFilter.value}` : ''
    const data = await api.get<{ fines: FineRow[], summary: Summary }>(`/fines${query}`)
    fines.value = data.fines ?? []
    summary.value = data.summary ?? null
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load the fines'
  } finally {
    loading.value = false
  }
}

async function loadRule() {
  if (!auth.canManageSettings) return
  try {
    const data = await api.get<{ global: { absentCentavos: number, lateCentavos: number, lateAfterMinutes: number } }>('/settings/fines')
    rule.value = {
      absentPesos: String(data.global.absentCentavos / 100),
      latePesos: String(data.global.lateCentavos / 100),
      lateAfterMinutes: String(data.global.lateAfterMinutes)
    }
  } catch {
    // The card simply stays at the defaults.
  }
}

async function saveRule() {
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    await api.put('/settings/fines', {
      absentCentavos: Math.round(Number(rule.value.absentPesos) * 100),
      lateCentavos: Math.round(Number(rule.value.latePesos) * 100),
      lateAfterMinutes: Number(rule.value.lateAfterMinutes)
    })
    notice.value = 'Fine rates saved for future events.'
    await loadRule()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not save the rates'
  } finally {
    busy.value = false
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

onMounted(async () => {
  await Promise.all([load(), loadRule(), loadExcuses()])
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">
        Fines
      </h1>
      <p class="text-sm text-slate mt-1">
        Generated after each event's check-in window closes, from the rates set here.
      </p>
    </div>

    <div v-if="error" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="notice" class="rounded-xl border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-navy">
      {{ notice }}
    </div>

    <!-- Summary -->
    <div v-if="summary" class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent class="p-4">
          <div class="text-xs uppercase tracking-wide text-slate">
            Unpaid
          </div>
          <div class="text-2xl font-bold text-navy font-serif">
            {{ summary.unpaidPesos }}
          </div>
          <div class="text-xs text-slate mt-1">
            {{ summary.unpaid }} fine{{ summary.unpaid === 1 ? '' : 's' }}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="text-xs uppercase tracking-wide text-slate">
            Settled
          </div>
          <div class="text-2xl font-bold text-navy font-serif">
            {{ peso(summary.paidCentavos) }}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="text-xs uppercase tracking-wide text-slate">
            Waived
          </div>
          <div class="text-2xl font-bold text-navy font-serif">
            {{ summary.waived }}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="p-4">
          <div class="text-xs uppercase tracking-wide text-slate">
            Records
          </div>
          <div class="text-2xl font-bold text-navy font-serif">
            {{ summary.count }}
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Rates (managers) -->
    <Card v-if="auth.canManageSettings">
      <CardContent class="p-6 space-y-4">
        <div class="font-semibold text-navy font-serif">
          Rates
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label>Absence (₱)</Label>
            <Input v-model="rule.absentPesos" type="number" />
          </div>
          <div class="space-y-2">
            <Label>Late (₱)</Label>
            <Input v-model="rule.latePesos" type="number" />
          </div>
          <div class="space-y-2">
            <Label>Late after (minutes)</Label>
            <Input v-model="rule.lateAfterMinutes" type="number" />
          </div>
        </div>
        <p class="text-xs text-slate">
          New rates apply to events whose fines have not been generated yet; existing fines keep the rule they were issued under.
        </p>
        <button
          class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          :disabled="busy"
          @click="saveRule"
        >
          Save rates
        </button>
      </CardContent>
    </Card>

    <!-- Excuse review queue (plan §8.5) -->
    <Card v-if="excuses.length > 0">
      <CardContent class="p-4 space-y-3">
        <div class="font-semibold text-navy font-serif">
          Excuses waiting for review
        </div>
        <ul class="divide-y divide-line text-sm">
          <li v-for="row in excuses" :key="row.id" class="py-2 space-y-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="min-w-0">
                <NuxtLink :to="`/manage/students/${row.student.id}`" class="font-medium text-navy hover:underline">
                  {{ row.student.name }}
                </NuxtLink>
                <span v-if="row.student.studentProfile" class="ml-2 font-mono text-xs text-slate">{{ row.student.studentProfile.studentNo }}</span>
                <span class="ml-2 text-xs text-slate">{{ row.fine.event.title }} · {{ row.fine.kind }} · {{ peso(row.fine.amountCentavos) }}</span>
              </span>
              <span class="flex items-center gap-2">
                <a
                  v-if="row.hasAttachment"
                  :href="`/api/excuses/${row.id}/attachment`"
                  target="_blank"
                  rel="noopener"
                  class="text-xs font-semibold text-navy hover:underline"
                >Attachment</a>
                <button
                  class="rounded-lg bg-navy px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  :disabled="busy"
                  @click="reviewExcuse(row, 'approve')"
                >
                  Approve
                </button>
                <button
                  class="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy disabled:opacity-50"
                  :disabled="busy"
                  @click="reviewExcuse(row, 'deny')"
                >
                  Deny
                </button>
              </span>
            </div>
            <div class="text-xs text-slate">
              <Badge variant="default">
                {{ row.category }}
              </Badge>
              <span class="ml-2">{{ row.reason }}</span>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- Filter -->
    <div class="flex items-center gap-2">
      <select v-model="statusFilter" class="rounded-lg border border-line px-3 py-1.5 text-sm" @change="load">
        <option value="unpaid">
          Unpaid
        </option>
        <option value="paid">
          Paid
        </option>
        <option value="waived">
          Waived
        </option>
        <option value="">
          Everything
        </option>
      </select>
    </div>

    <!-- List -->
    <div v-if="loading" class="text-center text-slate py-8">
      Loading…
    </div>
    <div v-else-if="visible.length === 0" class="text-center text-slate py-8">
      Nothing here.
    </div>
    <Card v-else>
      <CardContent class="p-4">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-slate border-b border-line">
                <th class="py-2 pr-3">
                  Student
                </th>
                <th class="py-2 pr-3">
                  Event
                </th>
                <th class="py-2 pr-3">
                  Why
                </th>
                <th class="py-2 pr-3 text-right">
                  Amount
                </th>
                <th class="py-2 pr-3">
                  Status
                </th>
                <th class="py-2">
                  Issued
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              <tr v-for="fine in visible" :key="fine.id" class="hover:bg-paper">
                <td class="py-2 pr-3">
                  <NuxtLink :to="`/manage/students/${fine.user.id}`" class="font-medium text-navy hover:underline">
                    {{ fine.user.name }}
                  </NuxtLink>
                  <span v-if="fine.user.studentProfile" class="ml-2 font-mono text-xs text-slate">{{ fine.user.studentProfile.studentNo }}</span>
                </td>
                <td class="py-2 pr-3">
                  <NuxtLink :to="`/manage/events/${fine.event.id}`" class="text-navy hover:underline">
                    {{ fine.event.title }}
                  </NuxtLink>
                </td>
                <td class="py-2 pr-3 text-slate">
                  {{ fine.kind === 'absent' ? 'Absent' : 'Late' }}
                </td>
                <td class="py-2 pr-3 text-right font-mono">
                  {{ peso(fine.amountCentavos) }}
                </td>
                <td class="py-2 pr-3">
                  <Badge :variant="statusVariants[fine.status]">
                    {{ fine.status }}
                  </Badge>
                </td>
                <td class="py-2 text-slate">
                  {{ formatDate(fine.issuedAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
