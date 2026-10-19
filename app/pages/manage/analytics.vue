<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

interface Semester { id: string, name: string, startsOn: string, endsOn: string }
interface Overview {
  events: number
  expected: number
  attended: number
  rate: number
  frozenAt?: string | null
  frozenEvents?: number
  signatures: { signed: number, rate: number }
  methods: Array<{ method: string, count: number }>
  noShows: number
}
interface EventRow {
  id: string
  title: string
  date: string
  category: { id: string, name: string, color: string | null } | null
  expected: number
  attended: number
  rate: number
  frozenAt: string | null
  signatures: { signed: number, rate: number }
}
interface GroupRow { key: string, label: string, expected: number, attended: number, rate: number }
interface Timing { total: number, peakHour: number | null, buckets: Array<{ hour: number, count: number }> }
interface RankedStudent { id: string, name: string, studentNo: string | null, yearLevel: number | null, section: string | null, attended: number }

const semesters = ref<Semester[]>([])
const semesterId = ref('')
const loading = ref(true)
const error = ref('')

const overview = ref<Overview | null>(null)
const events = ref<EventRow[]>([])
const groups = ref<GroupRow[]>([])
const groupBy = ref<'collegeId' | 'yearLevel' | 'sectionId'>('collegeId')
const timing = ref<Timing | null>(null)
const top = ref<RankedStudent[]>([])
const bottom = ref<RankedStudent[]>([])

const percent = (value: number) => `${Math.round(value * 100)}%`

const methodLabels: Record<string, string> = { qr: 'QR scan', manual: 'Manual', barcode: 'ID barcode', self: 'Self check-in' }

const timingMax = computed(() => Math.max(1, ...(timing.value?.buckets ?? []).map(b => b.count)))
const frozenCount = computed(() => events.value.filter(row => row.frozenAt).length)

async function load() {
  loading.value = true
  error.value = ''
  const query = semesterId.value ? `?semesterId=${semesterId.value}` : ''
  try {
    const [o, e, g, t, tp, bt] = await Promise.all([
      api.get<Overview>(`/analytics/overview${query}`),
      api.get<{ events: EventRow[] }>(`/analytics/events${query}`),
      api.get<{ groups: GroupRow[] }>(`/analytics/breakdown${query ? `${query}&` : '?'}by=${groupBy.value}`),
      api.get<Timing>(`/analytics/timing${query}`),
      api.get<{ students: RankedStudent[] }>(`/analytics/students${query ? `${query}&` : '?'}order=top&limit=5`),
      api.get<{ students: RankedStudent[] }>(`/analytics/students${query ? `${query}&` : '?'}order=bottom&limit=5`)
    ])
    overview.value = o
    events.value = e.events ?? []
    groups.value = g.groups ?? []
    timing.value = t
    top.value = tp.students ?? []
    bottom.value = bt.students ?? []
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load the dashboard'
  } finally {
    loading.value = false
  }
}

async function reloadGroups() {
  const query = semesterId.value ? `?semesterId=${semesterId.value}` : '?'
  try {
    const g = await api.get<{ groups: GroupRow[] }>(`/analytics/breakdown${query}${semesterId.value ? '&' : ''}by=${groupBy.value}`)
    groups.value = g.groups ?? []
  } catch {
    groups.value = []
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

/** When the roster was frozen (BC-4), in the same Manila clock as the reports. */
function formatFrozenAt(value: string) {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

onMounted(async () => {
  try {
    semesters.value = await api.get<Semester[]>('/reference/semesters')
    const now = Date.now()
    const current = semesters.value.find(s => new Date(s.startsOn).getTime() <= now && new Date(s.endsOn).getTime() > now)
    semesterId.value = current?.id ?? ''
  } catch {
    // Without semesters the dashboard simply shows all time.
  }
  await load()
})
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <!-- Header -->
    <div class="rounded-2xl bg-gradient-to-br from-navy-deep via-navy to-navy-light p-6 text-white relative overflow-hidden">
      <div class="absolute -right-10 -top-10 w-40 h-40 border border-white/10 rounded-full" />
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div class="text-xs tracking-widest uppercase text-gold font-bold mb-1">
            Attendance
          </div>
          <h1 class="text-2xl md:text-3xl font-bold font-serif">
            Analytics
          </h1>
          <p class="text-white/50 text-sm mt-1">
            Rates, trends and who never shows up — the same numbers the exports carry.
          </p>
        </div>
        <select v-model="semesterId" class="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white" @change="load">
          <option value="" class="text-navy">
            All time
          </option>
          <option
            v-for="s in semesters"
            :key="s.id"
            :value="s.id"
            class="text-navy"
          >
            {{ s.name }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="error" class="rounded-xl border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>
    <div v-else-if="loading" class="text-center text-slate py-12">
      Loading the numbers...
    </div>

    <template v-else-if="overview">
      <!-- Headline -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent class="p-4">
            <div class="text-xs uppercase tracking-wide text-slate">
              Attendance rate
            </div>
            <div class="text-2xl font-bold text-navy font-serif">
              {{ percent(overview.rate) }}
            </div>
            <div class="text-xs text-slate mt-1">
              {{ overview.attended }} of {{ overview.expected }} expected
            </div>
            <div v-if="overview.frozenEvents" class="text-[10px] text-slate mt-1">
              {{ overview.frozenEvents }} of {{ overview.events }} events frozen
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4">
            <div class="text-xs uppercase tracking-wide text-slate">
              Events
            </div>
            <div class="text-2xl font-bold text-navy font-serif">
              {{ overview.events }}
            </div>
            <div class="text-xs text-slate mt-1">
              {{ overview.noShows }} never appeared
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4">
            <div class="text-xs uppercase tracking-wide text-slate">
              Signatures
            </div>
            <div class="text-2xl font-bold text-navy font-serif">
              {{ percent(overview.signatures.rate) }}
            </div>
            <div class="text-xs text-slate mt-1">
              {{ overview.signatures.signed }} signed
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-4">
            <div class="text-xs uppercase tracking-wide text-slate">
              How they came in
            </div>
            <div class="mt-1 space-y-0.5">
              <div v-for="m in overview.methods.slice(0, 3)" :key="m.method" class="flex items-center justify-between text-xs">
                <span class="text-slate">{{ methodLabels[m.method] ?? m.method }}</span>
                <span class="font-mono text-navy">{{ m.count }}</span>
              </div>
              <div v-if="overview.methods.length === 0" class="text-xs text-slate">
                No records yet
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Check-in timing -->
      <Card>
        <CardContent class="p-6 space-y-3">
          <div class="flex items-center justify-between">
            <div class="font-semibold text-navy font-serif">
              Check-in timing
            </div>
            <div class="text-xs text-slate">
              <span v-if="timing?.peakHour !== null && timing?.peakHour !== undefined">
                Busiest hour {{ String(timing.peakHour).padStart(2, '0') }}:00 · {{ timing.total }} check-ins
              </span>
              <span v-else>{{ timing?.total ?? 0 }} check-ins</span>
            </div>
          </div>
          <div class="flex items-end gap-0.5 h-24">
            <div
              v-for="bucket in timing?.buckets ?? []"
              :key="bucket.hour"
              class="flex-1 rounded-t-sm"
              :class="bucket.count > 0 ? 'bg-navy' : 'bg-line'"
              :style="{ height: `${Math.max(2, (bucket.count / timingMax) * 100)}%` }"
              :title="`${String(bucket.hour).padStart(2, '0')}:00 — ${bucket.count}`"
            />
          </div>
          <div class="flex justify-between text-[10px] text-slate font-mono">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
          </div>
        </CardContent>
      </Card>

      <!-- Breakdown -->
      <Card>
        <CardContent class="p-6 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="font-semibold text-navy font-serif">
              Where attendance comes from
            </div>
            <select v-model="groupBy" class="rounded-lg border border-line px-3 py-1.5 text-sm" @change="reloadGroups">
              <option value="collegeId">
                By college
              </option>
              <option value="yearLevel">
                By year level
              </option>
              <option value="sectionId">
                By section
              </option>
            </select>
          </div>
          <div v-if="groups.length === 0" class="text-sm text-slate">
            No placements to group by yet.
          </div>
          <div v-else class="space-y-2">
            <div v-for="group in groups" :key="group.key" class="space-y-1">
              <div class="flex items-center justify-between text-sm">
                <span class="text-navy">{{ group.label }}</span>
                <span class="text-xs text-slate">
                  {{ group.attended }} of {{ group.expected }} · <span class="font-mono">{{ percent(group.rate) }}</span>
                </span>
              </div>
              <div class="h-2 rounded-full bg-line overflow-hidden">
                <div class="h-full rounded-full bg-gold" :style="{ width: `${Math.round(group.rate * 100)}%` }" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Per event -->
      <Card>
        <CardContent class="p-6 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="font-semibold text-navy font-serif">
              Per event
            </div>
            <div v-if="frozenCount > 0" class="text-xs text-slate">
              “Frozen” is the expected roster recorded when the window closed.
            </div>
          </div>
          <div v-if="events.length === 0" class="text-sm text-slate">
            No events in this window.
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide text-slate border-b border-line">
                  <th class="py-2 pr-3">
                    Event
                  </th>
                  <th class="py-2 pr-3">
                    Date
                  </th>
                  <th class="py-2 pr-3 text-right">
                    Attended
                  </th>
                  <th class="py-2 pr-3 text-right">
                    Expected
                  </th>
                  <th class="py-2 pr-3 text-right">
                    Rate
                  </th>
                  <th class="py-2 text-right">
                    Signed
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                <tr v-for="row in events" :key="row.id" class="hover:bg-paper">
                  <td class="py-2 pr-3">
                    <NuxtLink :to="`/manage/events/${row.id}`" class="font-medium text-navy hover:underline">
                      {{ row.title }}
                    </NuxtLink>
                    <Badge v-if="row.category" variant="default" class="ml-2">
                      {{ row.category.name }}
                    </Badge>
                  </td>
                  <td class="py-2 pr-3 text-slate">
                    {{ formatDate(row.date) }}
                  </td>
                  <td class="py-2 pr-3 text-right font-mono">
                    {{ row.attended }}
                  </td>
                  <td class="py-2 pr-3 text-right font-mono">
                    {{ row.expected }}
                    <div v-if="row.frozenAt" class="font-sans text-[10px] font-normal text-slate">
                      frozen {{ formatFrozenAt(row.frozenAt) }}
                    </div>
                  </td>
                  <td class="py-2 pr-3 text-right font-mono">
                    {{ percent(row.rate) }}
                  </td>
                  <td class="py-2 text-right font-mono">
                    {{ percent(row.signatures.rate) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <!-- Top and bottom -->
      <div class="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent class="p-6 space-y-2">
            <div class="font-semibold text-navy font-serif">
              Most present
            </div>
            <div v-if="top.length === 0" class="text-sm text-slate">
              Nobody yet.
            </div>
            <ul v-else class="divide-y divide-line text-sm">
              <li v-for="student in top" :key="student.id" class="flex items-center justify-between gap-2 py-2">
                <NuxtLink :to="`/manage/students/${student.id}`" class="min-w-0 truncate text-navy hover:underline">
                  {{ student.name }}
                </NuxtLink>
                <span class="shrink-0 font-mono text-xs text-slate">{{ student.attended }}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="p-6 space-y-2">
            <div class="font-semibold text-navy font-serif">
              Never present
            </div>
            <div v-if="bottom.length === 0" class="text-sm text-slate">
              Everybody has shown up at least once.
            </div>
            <ul v-else class="divide-y divide-line text-sm">
              <li v-for="student in bottom" :key="student.id" class="flex items-center justify-between gap-2 py-2">
                <NuxtLink :to="`/manage/students/${student.id}`" class="min-w-0 truncate text-navy hover:underline">
                  {{ student.name }}
                </NuxtLink>
                <span class="shrink-0 font-mono text-xs text-slate">{{ student.attended }}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
