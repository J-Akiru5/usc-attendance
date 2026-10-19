<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api } from '@/lib/api'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Select from '@/components/ui/Select.vue'

/**
 * Staff queue for student rectification requests (benchmark BC-11).
 *
 * The queue lives under /account because T-0007 owns the account pages, not
 * the manage pages; the navigation link belongs in the manage area in a
 * follow-up once that file is free to touch.
 */
definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['staff', 'super_admin'] })

interface QueueRow {
  id: string
  field: string
  currentValue: string | null
  proposedValue: string
  note: string | null
  status: 'pending' | 'accepted' | 'rejected'
  reason: string | null
  createdAt: string
  decidedAt: string | null
  requester: {
    id: string
    name: string
    email: string
    studentProfile: { studentNo: string, yearLevel: number | null, section: { name: string } | null } | null
  }
  decider: { id: string, name: string } | null
}

const fields: Record<string, string> = {
  name: 'Full name',
  studentNo: 'Student number',
  yearLevel: 'Year level',
  section: 'Section'
}

const requests = ref<QueueRow[]>([])
const filter = ref('pending')
const reasons = reactive<Record<string, string>>({})
const loading = ref(true)
const deciding = ref<string | null>(null)
const error = ref('')
const notice = ref('')

const statusVariant = (status: QueueRow['status']) =>
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
  error.value = ''
  try {
    const data = await api.get<{ requests: QueueRow[] }>(`/privacy/requests?status=${filter.value}`)
    requests.value = data.requests ?? []
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load the correction queue'
  } finally {
    loading.value = false
  }
}

async function decide(request: QueueRow, status: 'accepted' | 'rejected') {
  const reason = (reasons[request.id] ?? '').trim()
  if (!reason) {
    error.value = 'Write a reason before deciding — the student sees it and the audit log keeps it.'
    return
  }
  if (status === 'accepted' && !window.confirm(
    `Apply "${request.proposedValue}" as the student's ${fields[request.field] ?? request.field}? `
    + 'The change is recorded in the audit log.'
  )) {
    return
  }

  deciding.value = request.id
  error.value = ''
  notice.value = ''
  try {
    await api.patch(`/privacy/requests/${request.id}`, { status, reason })
    reasons[request.id] = ''
    notice.value = status === 'accepted'
      ? 'The correction was applied and audited.'
      : 'The request was rejected with a reason.'
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not record the decision'
  } finally {
    deciding.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-navy font-serif">
          Correction requests
        </h1>
        <p class="text-sm text-slate mt-1">
          Student requests to correct a stored profile field. Accepting applies the change and writes one audit row
          naming the requester, the decider and the reason; rejecting also needs a reason.
        </p>
      </div>
      <NuxtLink to="/account/privacy" class="text-sm font-semibold text-navy underline">
        My own data page
      </NuxtLink>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <div class="space-y-1.5">
        <Label for="queue-filter">
          Show
        </Label>
        <Select
          id="queue-filter"
          v-model="filter"
          class="sm:w-48"
          @update:model-value="load"
        >
          <option value="pending">
            Pending
          </option>
          <option value="decided">
            Decided
          </option>
          <option value="all">
            All
          </option>
        </Select>
      </div>
    </div>

    <div v-if="error" role="alert" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="notice" role="status" class="rounded-xl border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-navy">
      {{ notice }}
    </div>

    <div v-if="loading" class="text-center text-slate py-8">
      Loading…
    </div>
    <div v-else-if="requests.length === 0" class="text-center text-slate py-8">
      Nothing in this view.
    </div>

    <div v-else class="space-y-3">
      <Card v-for="request in requests" :key="request.id">
        <CardContent class="p-4 md:p-5 space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="font-semibold text-navy">
                {{ request.requester.name }}
                <span class="text-slate font-normal">
                  · {{ request.requester.studentProfile?.studentNo ?? 'no student number' }}
                </span>
              </div>
              <div class="text-xs text-slate">
                {{ request.requester.email }}
                <span v-if="request.requester.studentProfile?.section">
                  · {{ request.requester.studentProfile.section.name }}
                </span>
                · asked {{ formatDate(request.createdAt) }}
              </div>
            </div>
            <Badge :variant="statusVariant(request.status)">
              {{ request.status }}
            </Badge>
          </div>

          <div class="rounded-lg bg-paper p-3 text-sm">
            <div class="text-xs uppercase tracking-wide text-slate">
              {{ fields[request.field] ?? request.field }}
            </div>
            <div class="mt-1 text-ink">
              <span class="text-slate">From</span>
              {{ request.currentValue ?? 'not set' }}
              <span class="text-slate">to</span>
              <span class="font-semibold">{{ request.proposedValue }}</span>
            </div>
            <p v-if="request.note" class="text-xs text-slate mt-2">
              Student note: {{ request.note }}
            </p>
          </div>

          <div v-if="request.status === 'pending'" class="space-y-2">
            <Label :for="`reason-${request.id}`">
              Decision reason (required)
            </Label>
            <Input
              :id="`reason-${request.id}`"
              v-model="reasons[request.id]"
              placeholder="What did you check, and what did you find?"
            />
            <div class="flex flex-wrap gap-2">
              <Button
                :disabled="deciding === request.id || !(reasons[request.id] ?? '').trim()"
                @click="decide(request, 'accepted')"
              >
                Accept and apply
              </Button>
              <Button
                variant="destructive"
                :disabled="deciding === request.id || !(reasons[request.id] ?? '').trim()"
                @click="decide(request, 'rejected')"
              >
                Reject
              </Button>
            </div>
          </div>

          <p v-else class="text-xs text-slate">
            {{ request.status === 'accepted' ? 'Applied' : 'Rejected' }}
            on {{ formatDate(request.decidedAt) }}
            <span v-if="request.decider">by {{ request.decider.name }}</span>:
            <span class="text-ink">{{ request.reason }}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
