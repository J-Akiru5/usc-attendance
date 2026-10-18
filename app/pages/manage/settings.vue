<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import { formatManila } from '@/lib/manila'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff', 'client'] })

interface Semester { id: string, name: string, startsOn: string, endsOn: string }
interface Retention {
  signatureRetentionSemesters: number
  purgeGraceDays: number
  lastPurgeAt: string | null
  lastPurgeCount: number | null
  semesters: Semester[]
  liveSignatures: number
  unassignedSignatures: number
}

interface Quota { count: number, limit: number, remaining: number, exceeded: boolean, dayStart: string }
interface Category { id: string, code: string, name: string, color: string, sortOrder: number }

const data = ref<Retention | null>(null)
const quota = ref<Quota | null>(null)
const categories = ref<Category[]>([])
const categoryForm = ref({ code: '', name: '', color: '#C9A24B' })
const keep = ref(1)
const grace = ref(30)
const loading = ref(true)
const error = ref('')
const note = ref('')
const busy = ref(false)
const sem = ref({ name: '', startsOn: '', endsOn: '' })

async function load() {
  error.value = ''
  try {
    const r = await api.get<Retention>('/settings/retention')
    data.value = r
    keep.value = r.signatureRetentionSemesters
    grace.value = r.purgeGraceDays
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
  try {
    quota.value = await api.get<Quota>('/settings/email-quota')
  } catch {
    // Only settings managers see the quota; everyone else just misses the card.
    quota.value = null
  }
  try {
    categories.value = await api.get<Category[]>('/reference/categories')
  } catch {
    categories.value = []
  }
}

async function loadCategories() {
  try {
    categories.value = await api.get<Category[]>('/reference/categories')
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load event categories'
  }
}

async function addCategory() {
  busy.value = true
  error.value = ''
  try {
    await api.post('/reference/categories', { ...categoryForm.value })
    categoryForm.value = { code: '', name: '', color: '#C9A24B' }
    await loadCategories()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not add the category'
  } finally {
    busy.value = false
  }
}

async function renameCategory(category: Category) {
  const name = window.prompt('Category name', category.name)
  if (!name) return
  const color = window.prompt('Colour (#rrggbb)', category.color)
  if (!color) return
  busy.value = true
  try {
    await api.patch('/reference/categories', { id: category.id, name, color })
    await loadCategories()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not update the category'
  } finally {
    busy.value = false
  }
}

async function archiveCategory(category: Category) {
  if (!window.confirm(`Archive ${category.name}? Events keep their colour until reassigned.`)) return
  busy.value = true
  try {
    await api.patch('/reference/categories', { id: category.id, archived: true })
    await loadCategories()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not archive the category'
  } finally {
    busy.value = false
  }
}
onMounted(load)

async function run<T>(fn: () => Promise<T>, ok: string) {
  error.value = ''
  note.value = ''
  busy.value = true
  try {
    await fn()
    note.value = ok
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Something went wrong'
  } finally {
    busy.value = false
  }
}

const saveRetention = () =>
  run(() => api.put('/settings/retention', { signatureRetentionSemesters: keep.value, purgeGraceDays: grace.value }), 'Retention saved.')

async function addSemester() {
  await run(async () => {
    // The form takes the last day; the API wants the (exclusive) day after it.
    const end = new Date(new Date(`${sem.value.endsOn}T00:00:00+08:00`).getTime() + 86_400_000).toISOString()
    await api.post('/semesters', { name: sem.value.name, startsOn: sem.value.startsOn, endsOn: end })
    sem.value = { name: '', startsOn: '', endsOn: '' }
  }, 'Semester added.')
}

const removeSemester = (s: Semester) =>
  confirm(`Remove "${s.name}"? Signatures in it will no longer be assigned to a semester.`)
    ? run(() => api.delete(`/semesters/${s.id}`), 'Semester removed.')
    : undefined

async function purge() {
  if (!confirm('Delete the signature images that are past retention now? This cannot be undone.')) return
  await run(async () => {
    const r = await api.post<{ purged: number, semesters: string[] }>('/settings/purge-signatures', {})
    note.value = `${r.purged} signature image(s) deleted.`
  }, '')
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })
const field = 'w-full rounded-lg border border-line px-3 py-2 text-sm'
const lbl = 'block text-[10px] font-bold uppercase tracking-wider text-navy'
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">
        Settings
      </h1>
      <p class="text-sm text-slate">
        Signature retention and semesters. Event check-in windows are set on each event's page.
      </p>
    </div>

    <div v-if="error" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-if="note" class="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
      {{ note }}
    </div>
    <div v-if="loading" class="text-center text-slate py-10">
      Loading…
    </div>

    <template v-else-if="data">
      <Card>
        <CardContent class="p-6 space-y-4">
          <div>
            <h2 class="text-lg font-semibold text-navy">
              Signature retention
            </h2>
            <p class="text-xs text-slate">
              A signature image is kept for the semester it was signed in, plus any extra semesters below. After that
              semester ends (plus the grace period) the image is deleted automatically each night. The attendance record and
              its SIG- reference stay, so reports still show who attended.
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label :class="lbl">Keep for (semesters)
              <input
                v-model.number="keep"
                type="number"
                min="1"
                max="8"
                :class="field"
                class="mt-1 font-normal"
              >
              <span class="block mt-1 text-[11px] font-normal normal-case tracking-normal text-slate">1 = only the semester it was signed in</span>
            </label>
            <label :class="lbl">Grace period (days)
              <input
                v-model.number="grace"
                type="number"
                min="0"
                max="365"
                :class="field"
                class="mt-1 font-normal"
              >
              <span class="block mt-1 text-[11px] font-normal normal-case tracking-normal text-slate">extra days after the semester ends</span>
            </label>
          </div>
          <Button variant="gold" :disabled="busy" @click="saveRetention">
            Save retention
          </Button>

          <div class="rounded-lg bg-paper-panel border border-line p-3 text-xs text-slate space-y-1">
            <div>{{ data.liveSignatures }} signature image(s) currently stored<span v-if="data.unassignedSignatures > 0"> — <strong class="text-warning">{{ data.unassignedSignatures }} are not inside any semester below, so they are never deleted automatically</strong></span>.</div>
            <div>Last cleanup: {{ data.lastPurgeAt ? `${formatManila(data.lastPurgeAt)} (${data.lastPurgeCount ?? 0} deleted)` : 'never run' }}</div>
          </div>
          <Button variant="outline" :disabled="busy" @click="purge">
            Run cleanup now
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-6 space-y-4">
          <div>
            <h2 class="text-lg font-semibold text-navy">
              Semesters
            </h2>
            <p class="text-xs text-slate">
              Enter each semester's first and last day (Philippine dates). They cannot overlap. Retention only counts semesters you have defined.
            </p>
          </div>

          <div v-if="data.semesters.length === 0" class="text-sm text-slate">
            No semesters yet — nothing will be deleted until you add some.
          </div>
          <ul v-else class="divide-y divide-line rounded-lg border border-line">
            <li v-for="s in data.semesters" :key="s.id" class="flex items-center justify-between gap-3 px-3 py-2">
              <div class="min-w-0">
                <div class="font-medium text-navy truncate">
                  {{ s.name }}
                </div>
                <div class="text-xs text-slate">
                  {{ day(s.startsOn) }} → {{ day(new Date(new Date(s.endsOn).getTime() - 1).toISOString()) }}
                </div>
              </div>
              <Button variant="outline" :disabled="busy" @click="removeSemester(s)">
                Remove
              </Button>
            </li>
          </ul>

          <form class="grid gap-3 sm:grid-cols-3 items-end" @submit.prevent="addSemester">
            <label :class="lbl" class="sm:col-span-3">Name
              <input
                v-model="sem.name"
                :class="field"
                class="mt-1 font-normal normal-case tracking-normal"
                placeholder="1st Semester 2026-2027"
              >
            </label>
            <label :class="lbl">First day
              <input
                v-model="sem.startsOn"
                type="date"
                :class="field"
                class="mt-1 font-normal"
              >
            </label>
            <label :class="lbl">Last day
              <input
                v-model="sem.endsOn"
                type="date"
                :class="field"
                class="mt-1 font-normal"
              >
            </label>
            <Button type="submit" variant="gold" :disabled="busy || !sem.name || !sem.startsOn || !sem.endsOn">
              Add semester
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card v-if="categories.length || data">
        <CardContent class="space-y-3">
          <div class="text-sm font-semibold text-navy">
            Event categories
          </div>
          <p class="text-xs text-slate">
            Colour-coded groupings for the calendar (General Assembly, Flag Ceremony, …). Managers can add, rename, recolour and archive them.
          </p>
          <form class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end" @submit.prevent="addCategory">
            <label class="block text-[10px] font-bold uppercase tracking-wider text-navy">Code
              <input v-model="categoryForm.code" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal normal-case tracking-normal" placeholder="seminar">
            </label>
            <label class="block text-[10px] font-bold uppercase tracking-wider text-navy sm:col-span-2">Name
              <input v-model="categoryForm.name" class="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal normal-case tracking-normal" placeholder="Seminar">
            </label>
            <div class="flex items-end gap-2">
              <input
                v-model="categoryForm.color"
                type="color"
                class="h-9 w-12 rounded border border-line"
                aria-label="Category colour"
              >
              <Button type="submit" variant="gold" :disabled="busy || !categoryForm.code || !categoryForm.name">
                Add
              </Button>
            </div>
          </form>
          <ul class="divide-y divide-line">
            <li v-for="category in categories" :key="category.id" class="flex items-center justify-between gap-3 py-2 text-sm">
              <span class="flex items-center gap-2 text-navy">
                <span class="inline-block h-3 w-3 rounded-sm" :style="{ backgroundColor: category.color }" />
                <span class="font-medium">{{ category.name }}</span>
                <span class="font-mono text-xs text-slate">{{ category.code }}</span>
              </span>
              <span class="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="busy"
                  @click="renameCategory(category)"
                >Edit</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="busy"
                  @click="archiveCategory(category)"
                >Archive</Button>
              </span>
            </li>
            <li v-if="categories.length === 0" class="py-2 text-xs text-slate">
              No categories yet.
            </li>
          </ul>
        </CardContent>
      </Card>
      <Card v-if="quota">
        <CardContent>
          <div class="text-sm font-semibold text-navy">
            Email quota (today, UTC)
          </div>
          <p class="mt-1 text-xs text-slate">
            Transactional mail only — verification links, password resets. The free Resend plan allows
            {{ quota.limit }} sends a day; the guard stops sending before the plan does.
          </p>
          <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-line">
            <div
              class="h-full rounded-full"
              :class="quota.remaining === 0 ? 'bg-danger' : quota.remaining <= 10 ? 'bg-gold' : 'bg-success'"
              :style="{ width: `${Math.min(100, (quota.count / Math.max(1, quota.limit)) * 100)}%` }"
            />
          </div>
          <div class="mt-2 text-xs text-slate">
            <span class="font-mono">{{ quota.count }}</span> sent ·
            <span class="font-mono">{{ quota.remaining }}</span> left today
            <span v-if="quota.exceeded" class="ml-2 font-semibold text-danger">
              Quota reached — mail is being skipped until UTC midnight.
            </span>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
