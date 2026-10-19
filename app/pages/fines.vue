<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Label from '@/components/ui/Label.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true })

interface FineRow {
  id: string
  kind: 'absent' | 'late'
  amountCentavos: number
  status: 'unpaid' | 'paid' | 'waived'
  issuedAt: string
  paymentRef: string | null
  waiveReason: string | null
  event: { id: string, title: string, date: string } | null
}
interface Summary { count: number, unpaid: number, unpaidCentavos: number, unpaidPesos: string, cleared: boolean }
interface ClearanceInfo {
  code: string
  issuedAt: string
  coveredCentavos: number
  revokedAt: string | null
  issuer: { id: string, name: string } | null
}

const fines = ref<FineRow[]>([])
const summary = ref<Summary | null>(null)
const clearance = ref<ClearanceInfo | null>(null)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref(false)

// The excuse form (one open at a time is plenty).
const filingFor = ref<string | null>(null)
const excuse = ref({ category: 'medical', reason: '', attachment: null as File | null })

const peso = (centavos: number) => `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusVariants: Record<string, 'default' | 'success' | 'warning'> = {
  unpaid: 'warning',
  paid: 'success',
  waived: 'default'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [data, standing] = await Promise.all([
      api.get<{ fines: FineRow[], summary: Summary }>('/fines/mine'),
      api.get<{ clearance: ClearanceInfo | null }>('/clearance/mine')
    ])
    fines.value = data.fines ?? []
    summary.value = data.summary ?? null
    clearance.value = standing.clearance ?? null
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load your fines'
  } finally {
    loading.value = false
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.readAsDataURL(file)
  })
}

async function submitExcuse(fine: FineRow) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const body: Record<string, unknown> = { category: excuse.value.category, reason: excuse.value.reason }
    if (excuse.value.attachment) {
      body.attachment = {
        mime: excuse.value.attachment.type,
        dataBase64: await toBase64(excuse.value.attachment)
      }
    }
    await api.post(`/fines/${fine.id}/excuse`, body)
    notice.value = 'Your excuse was sent for review.'
    filingFor.value = null
    excuse.value = { category: 'medical', reason: '', attachment: null }
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not file the excuse'
  } finally {
    busy.value = false
  }
}

function onFile(event: Event) {
  const target = event.target as HTMLInputElement
  excuse.value.attachment = target.files?.[0] ?? null
}

onMounted(load)
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">
        My fines
      </h1>
      <p class="text-sm text-slate mt-1">
        Absences and late arrivals recorded for you. Settle them with the Treasurer, or file an excuse if there is a
        reason.
      </p>
    </div>

    <div v-if="error" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="notice" class="rounded-xl border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-navy">
      {{ notice }}
    </div>

    <Card v-if="summary">
      <CardContent class="p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-xs uppercase tracking-wide text-slate">
              Standing
            </div>
            <div class="text-2xl font-bold text-navy font-serif">
              {{ summary.unpaidPesos }} <span class="text-sm font-normal text-slate">unpaid</span>
            </div>
          </div>
          <Badge :variant="summary.cleared ? 'success' : 'warning'">
            {{ summary.cleared ? 'Cleared' : `${summary.unpaid} unpaid` }}
          </Badge>
        </div>
      </CardContent>
    </Card>

    <!-- Clearance certificate (plan §8.5) -->
    <Card v-if="clearance">
      <CardContent class="p-4 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs uppercase tracking-wide text-slate">
            Clearance certificate
          </div>
          <Badge :variant="clearance.revokedAt ? 'default' : 'success'">
            {{ clearance.revokedAt ? 'Revoked' : 'Issued' }}
          </Badge>
        </div>
        <div class="font-mono text-lg font-bold tracking-widest text-navy">
          {{ clearance.code }}
        </div>
        <p class="text-xs text-slate">
          Issued {{ new Date(clearance.issuedAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }) }}
          <span v-if="clearance.issuer"> by {{ clearance.issuer.name }}</span>.
          Show this code, or the link below, to anyone who needs to check it.
        </p>
        <NuxtLink :to="`/verify/${clearance.code}`" class="text-xs font-semibold text-navy hover:underline">
          Open the public verification page
        </NuxtLink>
        <p v-if="summary && !summary.cleared" class="text-xs text-danger">
          You have new unpaid fines since it was issued, so it will read as “no longer cleared” until you settle them.
        </p>
      </CardContent>
    </Card>

    <div v-if="loading" class="text-center text-slate py-8">
      Loading…
    </div>
    <div v-else-if="fines.length === 0" class="text-center text-slate py-8">
      Nothing recorded for you — keep it that way.
    </div>

    <Card v-for="fine in fines" v-else :key="fine.id">
      <CardContent class="p-4 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <Badge :variant="statusVariants[fine.status]">
                {{ fine.status }}
              </Badge>
              <span class="text-xs text-slate">{{ fine.kind === 'absent' ? 'Absence' : 'Late' }} · {{ formatDate(fine.issuedAt) }}</span>
            </div>
            <div class="font-semibold text-navy mt-1">
              {{ fine.event?.title ?? 'Event' }}
            </div>
            <div v-if="fine.paymentRef" class="text-xs text-slate">
              Receipt {{ fine.paymentRef }}
            </div>
            <div v-if="fine.waiveReason" class="text-xs text-slate">
              Waived: {{ fine.waiveReason }}
            </div>
          </div>
          <div class="text-right">
            <div class="font-mono font-semibold text-navy">
              {{ peso(fine.amountCentavos) }}
            </div>
          </div>
        </div>

        <div v-if="fine.status === 'unpaid'">
          <button
            v-if="filingFor !== fine.id"
            class="text-xs font-semibold text-navy hover:underline"
            @click="filingFor = fine.id"
          >
            File an excuse
          </button>

          <div v-else class="space-y-3 rounded-lg border border-line bg-paper p-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label>Reason</Label>
                <select v-model="excuse.category" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="medical">
                    Medical
                  </option>
                  <option value="academic">
                    Academic conflict
                  </option>
                  <option value="other">
                    Other
                  </option>
                </select>
              </div>
              <div class="space-y-1">
                <Label>Evidence (optional, PNG / JPEG / PDF, up to 5 MB)</Label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  class="text-xs"
                  @change="onFile"
                >
              </div>
            </div>
            <div class="space-y-1">
              <Label>What happened?</Label>
              <textarea
                v-model="excuse.reason"
                rows="3"
                class="w-full rounded-lg border border-line px-3 py-2 text-sm"
                placeholder="I was in the clinic with a fever, certificate attached."
              />
            </div>
            <div class="flex items-center gap-2">
              <button
                class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                :disabled="busy || excuse.reason.trim().length < 10"
                @click="submitExcuse(fine)"
              >
                {{ busy ? 'Sending…' : 'Send for review' }}
              </button>
              <button class="text-xs text-slate hover:underline" @click="filingFor = null">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
