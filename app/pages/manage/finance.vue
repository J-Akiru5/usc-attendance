<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import { downloadLiquidation, type ExportFormat } from '@/lib/download'
import { useAuthStore } from '@/stores/auth'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'

/**
 * Finance, budget & liquidation (plan §8.7). One page for the Treasurer's whole
 * loop: the semester budget and its lines, income and expenses with receipts,
 * the proposal workflow with its step buttons, and the liquidation exports.
 * Every permission is enforced by the API; the flags here only hide buttons.
 */
definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

interface Semester { id: string, name: string, startsOn: string, endsOn: string }
interface Line {
  id: string
  name: string
  category: string
  allocatedCentavos: number
  notes: string | null
  archived: boolean
  incomeCentavos: number
  expenseCentavos: number
  remainingCentavos: number
  entries: number
}
interface Totals { allocatedCentavos: number, incomeCentavos: number, expenseCentavos: number, remainingCentavos: number, remainingPesos?: string }
interface Entry {
  id: string
  kind: 'income' | 'expense'
  amountCentavos: number
  description: string
  spentAt: string
  receiptKey: string | null
  receiptName: string | null
  source: string | null
  overrideReason: string | null
  line: { id: string, name: string }
  recorder: { id: string, name: string }
  proposal: { id: string, title: string } | null
}
interface Step {
  id: string
  step: string
  actedAt: string
  signatoryName: string | null
  signatoryRole: string | null
  note: string | null
  attachmentKey: string | null
  actor: { id: string, name: string } | null
}
interface Proposal {
  id: string
  title: string
  description: string
  amountCentavos: number
  status: string
  projectName: string | null
  createdAt: string
  line: { id: string, name: string } | null
  event: { id: string, title: string, date: string } | null
  creator: { id: string, name: string }
  steps: Step[]
  stepNames: string[]
  nextSteps: string[]
}

const STEP_LABELS: Record<string, string> = {
  decided: 'Decided by the body',
  noted_president: 'Noted by the President',
  noted_adviser: 'Noted by the Adviser',
  noted_university_accountant: 'Noted by the University Accountant',
  approved: 'Approved by the Campus Administrator',
  released: 'Released',
  liquidated: 'Liquidated',
  rejected: 'Rejected by the body'
}
const STATUS_LABELS: Record<string, string> = {
  decided: 'Decided by the body',
  noted: 'Noted — awaiting approval',
  approved: 'Approved',
  released: 'Released',
  liquidated: 'Liquidated',
  rejected: 'Rejected'
}
const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning'> = {
  decided: 'default',
  noted: 'warning',
  approved: 'warning',
  released: 'success',
  liquidated: 'success',
  rejected: 'default'
}
const EXTERNAL_STEPS = ['noted_university_accountant', 'approved']
const LINE_CATEGORIES = ['supplies', 'events', 'travel', 'communication', 'other']
const INCOME_SOURCES = ['fines', 'fees', 'donation', 'other']

const auth = useAuthStore()
const canManage = computed(() => (auth.user?.capabilities ?? []).includes('finance.manage'))
const canRead = computed(() => (auth.user?.capabilities ?? []).some(c => ['finance.manage', 'finance.note', 'finance.audit'].includes(c)))
const canToggleTransparency = computed(() => canManage.value || auth.canManageSettings)

const busy = ref(false)
const loading = ref(true)
const error = ref('')
const notice = ref('')

const semesters = ref<Semester[]>([])
const semesterId = ref('')
const budget = ref<{ id: string, status: string, notes: string | null, semester: Semester, creator: { name: string } } | null>(null)
const lines = ref<Line[]>([])
const totals = ref<Totals | null>(null)
const entries = ref<Entry[]>([])
const finesIncomeCentavos = ref(0)
const proposals = ref<Proposal[]>([])

const peso = (centavos: number | null | undefined) =>
  `₱${((centavos ?? 0) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

// --- forms ----------------------------------------------------------------
const newLine = ref({ name: '', category: 'other', allocatedPesos: '' })
const entryForm = ref({
  kind: 'expense' as 'expense' | 'income',
  lineId: '',
  amountPesos: '',
  description: '',
  spentAt: new Date().toISOString().slice(0, 10),
  source: 'fines',
  proposalId: '',
  override: false,
  overrideReason: ''
})
const entryReceipt = ref<File | null>(null)
const newProposal = ref({ title: '', description: '', amountPesos: '', minutesReference: '', lineId: '', projectName: '' })
const proposalMinutes = ref<File | null>(null)

const pendingStep = ref<{ proposal: Proposal, step: string } | null>(null)
const stepForm = ref({ signatoryName: '', note: '', actedAt: new Date().toISOString().slice(0, 10) })
const stepAttachment = ref<File | null>(null)

const transparencyPublic = ref(false)
const transparencyNote = ref('')

// --- loading --------------------------------------------------------------
async function load() {
  loading.value = true
  error.value = ''
  try {
    const query = semesterId.value ? `?semesterId=${encodeURIComponent(semesterId.value)}` : ''
    const data = await api.get<{
      budget: typeof budget.value
      lines: Line[]
      totals: Totals | null
      entries: Entry[]
      finesIncomeCentavos: number
      semesters: Semester[]
    }>(`/finance/budget${query}`)
    budget.value = data.budget
    lines.value = data.lines ?? []
    totals.value = data.totals
    entries.value = data.entries ?? []
    finesIncomeCentavos.value = data.finesIncomeCentavos ?? 0
    semesters.value = data.semesters ?? []
    if (!semesterId.value && data.budget) semesterId.value = data.budget.semester.id
    await loadProposals()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load the budget'
  } finally {
    loading.value = false
  }
}

async function loadProposals() {
  if (!budget.value) {
    proposals.value = []
    return
  }
  const data = await api.get<{ proposals: Proposal[] }>(`/finance/proposals?budgetId=${budget.value.id}`)
  proposals.value = data.proposals ?? []
}

async function loadTransparency() {
  try {
    const data = await api.get<{ transparencyPublic: boolean, transparencyNote: string | null }>('/settings/transparency')
    transparencyPublic.value = data.transparencyPublic
    transparencyNote.value = data.transparencyNote ?? ''
  } catch {
    // The card simply stays hidden for anyone without a finance capability.
  }
}

async function run(action: () => Promise<void>, success: string) {
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    await action()
    notice.value = success
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'That did not work'
  } finally {
    busy.value = false
  }
}

// --- budget & lines -------------------------------------------------------
function openBudget() {
  if (!semesterId.value) return
  void run(async () => {
    await api.post('/finance/budget', { semesterId: semesterId.value })
    await load()
  }, 'Budget opened for that semester.')
}

function addLine() {
  const form = newLine.value
  void run(async () => {
    await api.post('/finance/lines', {
      budgetId: budget.value?.id,
      name: form.name,
      category: form.category,
      allocatedCentavos: Math.round(Number(form.allocatedPesos || '0') * 100)
    })
    newLine.value = { name: '', category: 'other', allocatedPesos: '' }
    await load()
  }, 'Line added.')
}

function saveAllocation(line: Line, pesos: string) {
  void run(async () => {
    await api.put(`/finance/lines/${line.id}`, { allocatedCentavos: Math.round(Number(pesos || '0') * 100) })
    await load()
  }, `Allocation for ${line.name} saved.`)
}

function archiveLine(line: Line) {
  void run(async () => {
    await api.delete(`/finance/lines/${line.id}`)
    await load()
  }, `${line.name} archived.`)
}

// --- money ----------------------------------------------------------------
function fileToBase64(file: File): Promise<string> {
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

async function uploadPayload(file: File) {
  return { mime: file.type, dataBase64: await fileToBase64(file), name: file.name }
}

function recordEntry() {
  const form = entryForm.value
  void run(async () => {
    const payload: Record<string, unknown> = {
      lineId: form.lineId,
      kind: form.kind,
      amountCentavos: Math.round(Number(form.amountPesos || '0') * 100),
      description: form.description,
      spentAt: form.spentAt
    }
    if (form.kind === 'income') payload.source = form.source
    if (form.kind === 'expense' && form.proposalId) payload.proposalId = form.proposalId
    if (form.kind === 'expense' && form.override) {
      payload.override = true
      payload.overrideReason = form.overrideReason
    }
    if (entryReceipt.value) payload.receipt = await uploadPayload(entryReceipt.value)

    await api.post('/finance/entries', payload)
    entryForm.value = { ...entryForm.value, amountPesos: '', description: '', override: false, overrideReason: '' }
    entryReceipt.value = null
    await load()
  }, 'Recorded.')
}

// --- proposals ------------------------------------------------------------
function createProposal() {
  const form = newProposal.value
  void run(async () => {
    const payload: Record<string, unknown> = {
      budgetId: budget.value?.id,
      title: form.title,
      description: form.description,
      amountCentavos: Math.round(Number(form.amountPesos || '0') * 100),
      minutesReference: form.minutesReference
    }
    if (form.lineId) payload.lineId = form.lineId
    if (form.projectName) payload.projectName = form.projectName
    if (proposalMinutes.value) payload.minutes = await uploadPayload(proposalMinutes.value)

    await api.post('/finance/proposals', payload)
    newProposal.value = { title: '', description: '', amountPesos: '', minutesReference: '', lineId: '', projectName: '' }
    proposalMinutes.value = null
    await load()
  }, 'Proposal recorded as decided by the body.')
}

function startStep(proposal: Proposal, step: string) {
  pendingStep.value = { proposal, step }
  stepForm.value = { signatoryName: '', note: '', actedAt: new Date().toISOString().slice(0, 10) }
  stepAttachment.value = null
  error.value = ''
  notice.value = ''
}

function recordStep() {
  const pending = pendingStep.value
  if (!pending) return
  void run(async () => {
    const payload: Record<string, unknown> = { step: pending.step, actedAt: stepForm.value.actedAt }
    if (stepForm.value.note) payload.note = stepForm.value.note
    if (EXTERNAL_STEPS.includes(pending.step)) {
      payload.signatoryName = stepForm.value.signatoryName
      if (stepAttachment.value) payload.attachment = await uploadPayload(stepAttachment.value)
    }
    await api.post(`/finance/proposals/${pending.proposal.id}/steps`, payload)
    pendingStep.value = null
    await load()
  }, `Step recorded: ${STEP_LABELS[pending.step]}.`)
}

async function exportLiquidation(proposal: Proposal, format: ExportFormat) {
  try {
    await downloadLiquidation(proposal.id, format, proposal.title)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not build the liquidation report'
  }
}

async function saveTransparency() {
  await run(async () => {
    await api.put('/settings/transparency', {
      transparencyPublic: transparencyPublic.value,
      transparencyNote: transparencyNote.value || null
    })
  }, transparencyPublic.value
    ? 'The transparency board is now public at /transparency.'
    : 'The transparency board is now private again.')
}

onMounted(async () => {
  await loadTransparency()
  await load()
})
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-navy font-serif">
          Finance
        </h1>
        <p class="text-sm text-slate mt-1">
          The semester budget, what came in and went out, and the approval trail of every proposal.
        </p>
      </div>
      <select v-model="semesterId" class="rounded-lg border border-line bg-panel px-3 py-2 text-sm" @change="load">
        <option value="">
          Latest budget
        </option>
        <option v-for="semester in semesters" :key="semester.id" :value="semester.id">
          {{ semester.name }}
        </option>
      </select>
    </div>

    <div v-if="error" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="notice" class="rounded-xl border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-navy">
      {{ notice }}
    </div>

    <Card v-if="!canRead">
      <CardContent class="p-6 text-sm text-slate">
        Your account does not hold a finance capability. Ask an administrator for the Treasurer,
        President/Adviser or Auditor role.
      </CardContent>
    </Card>

    <template v-else>
      <p v-if="loading" class="text-sm text-slate">
        Loading…
      </p>

      <!-- No budget yet -->
      <Card v-if="!loading && !budget">
        <CardContent class="p-6 space-y-3">
          <div class="font-semibold text-navy font-serif">
            No budget yet
          </div>
          <p class="text-sm text-slate">
            Pick the semester above and open its budget; line items and proposals hang off it.
          </p>
          <button
            v-if="canManage && semesterId"
            class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            :disabled="busy"
            @click="openBudget"
          >
            Open the budget
          </button>
        </CardContent>
      </Card>

      <template v-if="budget">
        <!-- Totals -->
        <div v-if="totals" class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent class="p-4">
              <div class="text-xs uppercase tracking-wide text-slate">
                Allocated
              </div>
              <div class="text-2xl font-bold text-navy font-serif">
                {{ peso(totals.allocatedCentavos) }}
              </div>
              <div class="text-xs text-slate mt-1">
                {{ budget.semester.name }}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <div class="text-xs uppercase tracking-wide text-slate">
                Spent
              </div>
              <div class="text-2xl font-bold text-navy font-serif">
                {{ peso(totals.expenseCentavos) }}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <div class="text-xs uppercase tracking-wide text-slate">
                Income
              </div>
              <div class="text-2xl font-bold text-navy font-serif">
                {{ peso(totals.incomeCentavos) }}
              </div>
              <div class="text-xs text-slate mt-1">
                fines settled on record: {{ peso(finesIncomeCentavos) }}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="p-4">
              <div class="text-xs uppercase tracking-wide text-slate">
                Remaining
              </div>
              <div class="text-2xl font-bold font-serif" :class="totals.remainingCentavos < 0 ? 'text-danger' : 'text-navy'">
                {{ peso(totals.remainingCentavos) }}
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- Lines -->
        <Card>
          <CardContent class="p-6 space-y-4">
            <div class="flex items-center justify-between">
              <div class="font-semibold text-navy font-serif">
                Budget lines
              </div>
              <Badge :variant="budget.status === 'open' ? 'success' : 'default'">
                {{ budget.status }}
              </Badge>
            </div>

            <div
              class="overflow-x-auto"
              tabindex="0"
              role="region"
              aria-label="Budget entries table"
            >
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase tracking-wide text-slate">
                    <th class="py-2">
                      Line
                    </th>
                    <th class="py-2">
                      Category
                    </th>
                    <th class="py-2 text-right">
                      Allocated
                    </th>
                    <th class="py-2 text-right">
                      Expenses
                    </th>
                    <th class="py-2 text-right">
                      Income
                    </th>
                    <th class="py-2 text-right">
                      Remaining
                    </th>
                    <th class="py-2" />
                  </tr>
                </thead>
                <tbody class="divide-y divide-line">
                  <tr v-for="line in lines" :key="line.id" :class="line.archived ? 'opacity-50' : ''">
                    <td class="py-2">
                      <span class="font-medium text-navy">{{ line.name }}</span>
                      <span v-if="line.archived" class="ml-2 text-xs text-slate">archived</span>
                      <div class="text-xs text-slate">
                        {{ line.entries }} entr{{ line.entries === 1 ? 'y' : 'ies' }}
                      </div>
                    </td>
                    <td class="py-2 text-slate">
                      {{ line.category }}
                    </td>
                    <td class="py-2 text-right">
                      <input
                        v-if="canManage && !line.archived"
                        class="w-24 rounded-lg border border-line px-2 py-1 text-right text-sm"
                        :value="(line.allocatedCentavos / 100).toString()"
                        type="number"
                        step="0.01"
                        @change="saveAllocation(line, ($event.target as HTMLInputElement).value)"
                      >
                      <span v-else>{{ peso(line.allocatedCentavos) }}</span>
                    </td>
                    <td class="py-2 text-right">
                      {{ peso(line.expenseCentavos) }}
                    </td>
                    <td class="py-2 text-right">
                      {{ peso(line.incomeCentavos) }}
                    </td>
                    <td class="py-2 text-right font-semibold" :class="line.remainingCentavos < 0 ? 'text-danger' : 'text-navy'">
                      {{ peso(line.remainingCentavos) }}
                    </td>
                    <td class="py-2 text-right">
                      <button
                        v-if="canManage && !line.archived"
                        class="text-xs font-semibold text-slate hover:text-danger"
                        :disabled="busy"
                        @click="archiveLine(line)"
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="canManage" class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end border-t border-line pt-4">
              <div class="space-y-2 sm:col-span-2">
                <Label>New line</Label>
                <Input v-model="newLine.name" placeholder="Office supplies" />
              </div>
              <div class="space-y-2">
                <Label>Category</Label>
                <select v-model="newLine.category" class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                  <option v-for="category in LINE_CATEGORIES" :key="category" :value="category">
                    {{ category }}
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <Label>Allocated (₱)</Label>
                <Input
                  v-model="newLine.allocatedPesos"
                  type="number"
                  step="0.01"
                  placeholder="5000.00"
                />
              </div>
              <button
                class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-4 sm:w-40"
                :disabled="busy || !newLine.name"
                @click="addLine"
              >
                Add line
              </button>
            </div>
          </CardContent>
        </Card>

        <!-- Record money -->
        <Card v-if="canManage">
          <CardContent class="p-6 space-y-4">
            <div class="font-semibold text-navy font-serif">
              Record income or an expense
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div class="space-y-2">
                <Label>Kind</Label>
                <select v-model="entryForm.kind" class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                  <option value="expense">
                    Expense
                  </option>
                  <option value="income">
                    Income
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <Label>Line</Label>
                <select v-model="entryForm.lineId" class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                  <option value="">
                    Pick a line
                  </option>
                  <option v-for="line in lines.filter(l => !l.archived)" :key="line.id" :value="line.id">
                    {{ line.name }} — left {{ peso(line.remainingCentavos) }}
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <Label>Amount (₱)</Label>
                <Input v-model="entryForm.amountPesos" type="number" step="0.01" />
              </div>
              <div class="space-y-2 lg:col-span-2">
                <Label>Description</Label>
                <Input v-model="entryForm.description" placeholder="Tarp printing, OR 12345" />
              </div>
              <div class="space-y-2">
                <Label>Date</Label>
                <Input v-model="entryForm.spentAt" type="date" />
              </div>
              <div v-if="entryForm.kind === 'income'" class="space-y-2">
                <Label>Source</Label>
                <select v-model="entryForm.source" class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                  <option v-for="source in INCOME_SOURCES" :key="source" :value="source">
                    {{ source }}
                  </option>
                </select>
              </div>
              <div v-if="entryForm.kind === 'expense'" class="space-y-2">
                <Label>Charged to a proposal (optional)</Label>
                <select v-model="entryForm.proposalId" class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                  <option value="">
                    No proposal
                  </option>
                  <option v-for="proposal in proposals.filter(p => p.status === 'released')" :key="proposal.id" :value="proposal.id">
                    {{ proposal.title }}
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <Label>Receipt (PNG, JPEG or PDF)</Label>
                <input
                  class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm"
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  @change="entryReceipt = ($event.target as HTMLInputElement).files?.[0] ?? null"
                >
              </div>
            </div>
            <div v-if="entryForm.kind === 'expense'" class="rounded-lg border border-line p-3 space-y-2">
              <label class="flex items-center gap-2 text-sm text-navy">
                <input v-model="entryForm.override" type="checkbox">
                Override the remaining line budget (only when the council agreed to go past it)
              </label>
              <Input v-if="entryForm.override" v-model="entryForm.overrideReason" placeholder="Why the line goes past its remaining budget" />
            </div>
            <button
              class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              :disabled="busy || !entryForm.lineId || !entryForm.amountPesos || !entryForm.description"
              @click="recordEntry"
            >
              Record
            </button>
          </CardContent>
        </Card>

        <!-- Proposals -->
        <Card>
          <CardContent class="p-6 space-y-4">
            <div class="font-semibold text-navy font-serif">
              Proposals
            </div>

            <div v-if="proposals.length === 0" class="text-sm text-slate">
              Nothing raised for this budget yet.
            </div>

            <ul class="space-y-4">
              <li v-for="proposal in proposals" :key="proposal.id" class="rounded-xl border border-line p-4 space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div class="font-medium text-navy">
                      {{ proposal.title }}
                    </div>
                    <div class="text-xs text-slate">
                      {{ peso(proposal.amountCentavos) }}
                      · {{ proposal.line?.name ?? 'no line' }}
                      <span v-if="proposal.event"> · {{ proposal.event.title }}</span>
                      <span v-if="proposal.projectName"> · {{ proposal.projectName }}</span>
                      · recorded by {{ proposal.creator.name }}
                    </div>
                  </div>
                  <Badge :variant="STATUS_VARIANTS[proposal.status] ?? 'default'">
                    {{ STATUS_LABELS[proposal.status] ?? proposal.status }}
                  </Badge>
                </div>

                <p class="text-sm text-slate">
                  {{ proposal.description }}
                </p>

                <ol class="text-xs text-slate space-y-1">
                  <li v-for="step in proposal.steps" :key="step.id" class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold text-navy">{{ STEP_LABELS[step.step] ?? step.step }}</span>
                    <span>{{ formatDate(step.actedAt) }}</span>
                    <span v-if="step.signatoryName">· {{ step.signatoryName }}<span v-if="step.signatoryRole"> ({{ step.signatoryRole }})</span></span>
                    <span v-else-if="step.actor">· recorded by {{ step.actor.name }}</span>
                    <span v-if="step.note">· {{ step.note }}</span>
                    <a
                      v-if="step.attachmentKey"
                      :href="`/api/finance/steps/${step.id}/attachment`"
                      target="_blank"
                      rel="noopener"
                      class="font-semibold text-navy underline hover:underline"
                    >signed copy</a>
                  </li>
                </ol>

                <div class="flex flex-wrap items-center gap-2">
                  <button
                    v-for="step in proposal.nextSteps"
                    :key="step"
                    class="rounded-lg bg-navy px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    :disabled="busy"
                    @click="startStep(proposal, step)"
                  >
                    {{ STEP_LABELS[step] ?? step }}
                  </button>
                  <button
                    v-if="canManage && !['released', 'liquidated', 'rejected'].includes(proposal.status)"
                    class="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy disabled:opacity-50"
                    :disabled="busy"
                    @click="startStep(proposal, 'rejected')"
                  >
                    Reject
                  </button>
                  <span class="ml-auto flex items-center gap-2 text-xs">
                    <span class="text-slate">Liquidation:</span>
                    <button class="font-semibold text-navy underline hover:underline" :disabled="busy" @click="exportLiquidation(proposal, 'csv')">
                      CSV
                    </button>
                    <button class="font-semibold text-navy underline hover:underline" :disabled="busy" @click="exportLiquidation(proposal, 'xlsx')">
                      Excel
                    </button>
                    <button class="font-semibold text-navy underline hover:underline" :disabled="busy" @click="exportLiquidation(proposal, 'pdf')">
                      PDF
                    </button>
                  </span>
                </div>

                <!-- One step at a time: the external signatories need a name and
                     the signed copy, the release needs its reference. -->
                <div v-if="pendingStep?.proposal.id === proposal.id" class="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-3">
                  <div class="text-sm font-medium text-navy">
                    {{ STEP_LABELS[pendingStep.step] }}
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div v-if="EXTERNAL_STEPS.includes(pendingStep.step)" class="space-y-2">
                      <Label>{{ pendingStep.step === 'approved' ? 'Campus Administrator' : 'University Accountant' }} (name)</Label>
                      <Input v-model="stepForm.signatoryName" placeholder="Full name on the signed copy" />
                    </div>
                    <div class="space-y-2">
                      <Label>Date of the step</Label>
                      <Input v-model="stepForm.actedAt" type="date" />
                    </div>
                    <div class="space-y-2 sm:col-span-2">
                      <Label>{{ pendingStep.step === 'released' ? 'Reference (voucher / check / OR no.)' : 'Note' }}</Label>
                      <Input v-model="stepForm.note" :placeholder="pendingStep.step === 'released' ? 'Voucher 2026-014' : 'Anything the record should carry'" />
                    </div>
                    <div v-if="EXTERNAL_STEPS.includes(pendingStep.step)" class="space-y-2 sm:col-span-2">
                      <Label>Signed copy (PNG, JPEG or PDF)</Label>
                      <input
                        class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm"
                        type="file"
                        accept="image/png,image/jpeg,application/pdf"
                        @change="stepAttachment = ($event.target as HTMLInputElement).files?.[0] ?? null"
                      >
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      :disabled="busy"
                      @click="recordStep"
                    >
                      Record the step
                    </button>
                    <button class="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy" @click="pendingStep = null">
                      Cancel
                    </button>
                  </div>
                </div>
              </li>
            </ul>

            <div v-if="canManage" class="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-line pt-4">
              <div class="space-y-2 sm:col-span-2">
                <Label>New proposal (as decided by the body)</Label>
                <Input v-model="newProposal.title" placeholder="Pag-abi-abi 2026 — sound system" />
              </div>
              <div class="space-y-2">
                <Label>Amount (₱)</Label>
                <Input v-model="newProposal.amountPesos" type="number" step="0.01" />
              </div>
              <div class="space-y-2 sm:col-span-3">
                <Label>Description</Label>
                <Input v-model="newProposal.description" placeholder="What the money is for" />
              </div>
              <div class="space-y-2 sm:col-span-2">
                <Label>Minutes reference (link or item)</Label>
                <Input v-model="newProposal.minutesReference" placeholder="Minutes of 2026-10-15, item 4" />
              </div>
              <div class="space-y-2">
                <Label>Budget line</Label>
                <select v-model="newProposal.lineId" class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                  <option value="">
                    Unassigned
                  </option>
                  <option v-for="line in lines.filter(l => !l.archived)" :key="line.id" :value="line.id">
                    {{ line.name }}
                  </option>
                </select>
              </div>
              <div class="space-y-2 sm:col-span-2">
                <Label>Project name (if it is not an event)</Label>
                <Input v-model="newProposal.projectName" placeholder="Outreach 2026" />
              </div>
              <div class="space-y-2">
                <Label>Minutes copy (optional)</Label>
                <input
                  class="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm"
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  @change="proposalMinutes = ($event.target as HTMLInputElement).files?.[0] ?? null"
                >
              </div>
              <button
                class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-3 sm:w-48"
                :disabled="busy || !newProposal.title || !newProposal.minutesReference"
                @click="createProposal"
              >
                Record the proposal
              </button>
            </div>
          </CardContent>
        </Card>

        <!-- Ledger -->
        <Card>
          <CardContent class="p-6 space-y-3">
            <div class="font-semibold text-navy font-serif">
              Recorded entries
            </div>
            <div v-if="entries.length === 0" class="text-sm text-slate">
              Nothing recorded yet.
            </div>
            <ul class="divide-y divide-line text-sm">
              <li v-for="entry in entries" :key="entry.id" class="py-2 flex flex-wrap items-center justify-between gap-2">
                <span class="min-w-0">
                  <span class="font-medium text-navy">{{ entry.description }}</span>
                  <span class="ml-2 text-xs text-slate">
                    {{ formatDate(entry.spentAt) }} · {{ entry.line.name }} · {{ entry.recorder.name }}
                    <span v-if="entry.proposal"> · {{ entry.proposal.title }}</span>
                    <span v-if="entry.overrideReason"> · over budget: {{ entry.overrideReason }}</span>
                  </span>
                </span>
                <span class="flex items-center gap-3">
                  <a
                    v-if="entry.receiptKey"
                    :href="`/api/finance/entries/${entry.id}/receipt`"
                    target="_blank"
                    rel="noopener"
                    class="text-xs font-semibold text-navy underline hover:underline"
                  >Receipt</a>
                  <span class="text-xs font-semibold" :class="entry.kind === 'income' ? 'text-success' : 'text-navy'">
                    {{ entry.kind === 'income' ? '+' : '−' }}{{ peso(entry.amountCentavos) }}
                  </span>
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </template>

      <!-- Transparency switch -->
      <Card v-if="canToggleTransparency">
        <CardContent class="p-6 space-y-3">
          <div class="font-semibold text-navy font-serif">
            Public transparency board
          </div>
          <p class="text-sm text-slate">
            When this is on, <NuxtLink to="/transparency" class="font-semibold text-navy underline hover:underline">
              /transparency
            </NuxtLink> shows a summary of this semester's lines to anyone — totals only, no names.
          </p>
          <label class="flex items-center gap-2 text-sm text-navy">
            <input v-model="transparencyPublic" type="checkbox">
            Publish the summary board
          </label>
          <div class="space-y-2">
            <Label>Note shown publicly (optional)</Label>
            <Input v-model="transparencyNote" placeholder="Figures as of the 2nd semester, A.Y. 2026-2027" />
          </div>
          <button
            class="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            :disabled="busy"
            @click="saveTransparency"
          >
            Save
          </button>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
