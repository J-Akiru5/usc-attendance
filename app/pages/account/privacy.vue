<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, getSupabaseClient } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Select from '@/components/ui/Select.vue'

/**
 * Student self-service for the two data-subject rights the portal owns:
 * access (a JSON copy) and rectification (a request a staff member decides).
 * The public /privacy page stays the notice; this page is the action.
 */
definePageMeta({ layout: 'dashboard', requiresAuth: true })

interface RequestRow {
  id: string
  field: string
  currentValue: string | null
  proposedValue: string
  note: string | null
  status: 'pending' | 'accepted' | 'rejected'
  reason: string | null
  createdAt: string
  decidedAt: string | null
  decider: { name: string } | null
}

const auth = useAuthStore()

const fields = [
  { value: 'name', label: 'Full name' },
  { value: 'studentNo', label: 'Student number' },
  { value: 'yearLevel', label: 'Year level' },
  { value: 'section', label: 'Section' }
] as const

const form = reactive({ field: 'name', proposedValue: '', note: '' })
const requests = ref<RequestRow[]>([])
const loading = ref(true)
const downloading = ref(false)
const submitting = ref(false)
const error = ref('')
const notice = ref('')

const isStaff = computed(() => auth.user?.role === 'staff' || auth.user?.role === 'super_admin')

const fieldLabel = (value: string) => fields.find(f => f.value === value)?.label ?? value

const statusVariant = (status: RequestRow['status']) =>
  status === 'accepted' ? 'success' as const : status === 'rejected' ? 'danger' as const : 'warning' as const

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

async function load() {
  loading.value = true
  try {
    const data = await api.get<{ requests: RequestRow[] }>('/privacy/requests/mine')
    requests.value = data.requests ?? []
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load your requests'
  } finally {
    loading.value = false
  }
}

async function downloadExport() {
  downloading.value = true
  error.value = ''
  notice.value = ''
  try {
    const client = getSupabaseClient()
    const session = client ? (await client.auth.getSession()).data.session : null
    const response = await fetch('/api/privacy/export', {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      cache: 'no-store'
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error || `Export failed (${response.status})`)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `usc-privacy-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    notice.value = 'Your data copy was downloaded. It contains only your own records.'
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not build your export'
  } finally {
    downloading.value = false
  }
}

async function submitRequest() {
  submitting.value = true
  error.value = ''
  notice.value = ''
  try {
    await api.post('/privacy/requests', {
      field: form.field,
      proposedValue: form.proposedValue,
      ...(form.note.trim() ? { note: form.note.trim() } : {})
    })
    form.proposedValue = ''
    form.note = ''
    notice.value = 'Your correction request was sent to the council office. You can follow it below.'
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not file the request'
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">
        My data &amp; privacy
      </h1>
      <p class="text-sm text-slate mt-1">
        Download a copy of what the USC officer portal holds about you, or ask the council to correct a stored detail.
        The public
        <NuxtLink to="/privacy" class="font-semibold text-navy underline">
          privacy notice
        </NuxtLink>
        explains why each record exists.
      </p>
    </div>

    <div v-if="error" role="alert" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="notice" role="status" class="rounded-xl border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-navy">
      {{ notice }}
    </div>

    <Card>
      <CardContent class="p-4 md:p-6 space-y-4">
        <div>
          <h2 class="font-bold text-navy">
            Download my data
          </h2>
          <p class="text-sm text-slate mt-1">
            A JSON file with your profile, consents, attendance, fines, clearances, excuse reasons and your correction
            requests. It never includes another student, internal notes, raw door-location coordinates or staff ids.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <Button :disabled="downloading" @click="downloadExport">
            {{ downloading ? 'Preparing…' : 'Download my data (JSON)' }}
          </Button>
          <NuxtLink
            v-if="isStaff"
            to="/account/privacy-queue"
            class="text-sm font-semibold text-navy underline"
          >
            Open the staff correction queue
          </NuxtLink>
        </div>
        <p class="text-xs text-slate">
          The download is generated for this signed-in account only and is never cached by a shared server.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="p-4 md:p-6 space-y-4">
        <div>
          <h2 class="font-bold text-navy">
            Ask for a correction
          </h2>
          <p class="text-sm text-slate mt-1">
            Only stored details you cannot edit yourself can be requested here: name, student number, year level and
            section. A staff member reviews the request and records a reason for the decision.
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="submitRequest">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <Label for="privacy-field">
                Field
              </Label>
              <Select id="privacy-field" v-model="form.field">
                <option v-for="option in fields" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </Select>
            </div>
            <div class="space-y-1.5">
              <Label for="privacy-value">
                Correct value
              </Label>
              <Input
                id="privacy-value"
                v-model="form.proposedValue"
                :placeholder="form.field === 'yearLevel' ? 'e.g. 3' : form.field === 'section' ? 'e.g. BSIT 2-A' : 'The exact value'"
                required
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <Label for="privacy-note">
              Why it needs correcting <span class="font-normal text-slate">(optional)</span>
            </Label>
            <textarea
              id="privacy-note"
              v-model="form.note"
              rows="3"
              maxlength="500"
              class="w-full rounded-lg border border-line bg-paper-panel px-3 py-2 text-sm text-ink placeholder:text-slate focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
              placeholder="For example: my name is missing the middle initial on my school ID."
            />
          </div>

          <Button type="submit" :disabled="submitting">
            {{ submitting ? 'Sending…' : 'Send request' }}
          </Button>
        </form>

        <p class="text-xs text-slate">
          Attendance records, fines, payments, waivers and clearance standing are records of events, not profile fields.
          They are reviewed through the
          <NuxtLink to="/fines" class="font-semibold text-navy underline">
            fines and excuse path
          </NuxtLink>
          instead of being rewritten here.
        </p>
      </CardContent>
    </Card>

    <div>
      <h2 class="font-bold text-navy mb-3">
        My requests
      </h2>

      <div v-if="loading" class="text-center text-slate py-6">
        Loading…
      </div>
      <div v-else-if="requests.length === 0" class="text-center text-slate py-6">
        You have not asked for a correction yet.
      </div>

      <div v-else class="space-y-3">
        <Card v-for="request in requests" :key="request.id">
          <CardContent class="p-4 space-y-2">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="text-sm font-semibold text-navy">
                  {{ fieldLabel(request.field) }}
                </div>
                <div class="text-xs text-slate">
                  Asked {{ formatDate(request.createdAt) }}
                </div>
              </div>
              <Badge :variant="statusVariant(request.status)">
                {{ request.status }}
              </Badge>
            </div>

            <div class="text-sm text-ink">
              <span class="text-slate">From</span>
              {{ request.currentValue ?? 'not set' }}
              <span class="text-slate">to</span>
              <span class="font-semibold">{{ request.proposedValue }}</span>
            </div>
            <p v-if="request.note" class="text-xs text-slate">
              Your note: {{ request.note }}
            </p>
            <p v-if="request.reason" class="text-xs text-slate">
              Decision{{ request.decider ? ` by ${request.decider.name}` : '' }} on {{ formatDate(request.decidedAt) }}:
              <span class="text-ink">{{ request.reason }}</span>
            </p>
            <p v-else class="text-xs text-slate">
              Waiting for a staff decision.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
