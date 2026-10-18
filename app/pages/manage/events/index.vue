<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useEventStore } from '@/stores/events'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import Badge from '@/components/ui/Badge.vue'
import Input from '@/components/ui/Input.vue'
import { api } from '@/lib/api'
import Label from '@/components/ui/Label.vue'
import LocationPicker from '@/components/ui/LocationPicker.vue'

definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff'] })

const events = useEventStore()
const auth = useAuthStore()
const router = useRouter()
const showCreate = ref(false)

const form = ref({
  title: '',
  date: '',
  time: '',
  lat: '',
  lng: '',
  radiusMeters: '50',
  categoryId: '',
  capacity: '',
  registrationRequired: false,
  repeat: 'none' as 'none' | 'daily' | 'weekly' | 'monthly',
  repeatInterval: '1',
  repeatDays: [] as number[],
  repeatEnds: 'count' as 'count' | 'date',
  repeatCount: '10',
  repeatUntil: '',
  audienceType: 'all' as 'all' | 'college' | 'yearLevel' | 'section',
  audienceCollegeId: '',
  audienceYearLevel: '',
  audienceSectionId: ''
})

/** Required audience (plan §8.2): who must attend — drives expected & fines. */
interface CollegeOption { id: string, code: string, name: string }
interface SectionOption { id: string, name: string, yearLevel: number, programId: string }
const colleges = ref<CollegeOption[]>([])
const sections = ref<SectionOption[]>([])
const audienceLabel = computed(() => {
  if (form.value.audienceType === 'all') return 'All students are expected at this event.'
  if (form.value.audienceType === 'college') {
    const college = colleges.value.find(c => c.id === form.value.audienceCollegeId)
    return college ? `Everyone in ${college.code || college.name} is expected.` : 'Pick a college.'
  }
  if (form.value.audienceType === 'yearLevel') {
    return form.value.audienceYearLevel ? `Everyone in year ${form.value.audienceYearLevel} is expected.` : 'Pick a year level.'
  }
  const section = sections.value.find(s => s.id === form.value.audienceSectionId)
  return section ? `Everyone in ${section.name} is expected.` : 'Pick a section.'
})

function buildAudienceFields(): Record<string, unknown> {
  if (form.value.audienceType === 'all') return { audienceType: 'all' }
  if (form.value.audienceType === 'college') {
    return { audienceType: 'college', audienceCollegeId: form.value.audienceCollegeId || null }
  }
  if (form.value.audienceType === 'yearLevel') {
    return { audienceType: 'yearLevel', audienceYearLevel: form.value.audienceYearLevel ? Number(form.value.audienceYearLevel) : null }
  }
  return { audienceType: 'section', audienceSectionId: form.value.audienceSectionId || null }
}

/** Recurrence (plan §8.2) — a small RRULE builder the server then validates. */
const DAY_TOKENS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const intervalUnit = computed(() => {
  const n = Number(form.value.repeatInterval) || 1
  const base = form.value.repeat === 'daily' ? 'day' : form.value.repeat === 'monthly' ? 'month' : 'week'
  return n === 1 ? `every ${base}` : `every ${n} ${base}s`
})

function dayLabel(index: number): string {
  return DAY_LABELS[index]!.slice(0, 3)
}

function toggleRepeatDay(index: number) {
  const days = form.value.repeatDays
  form.value.repeatDays = days.includes(index) ? days.filter(d => d !== index) : [...days, index].sort((a, b) => a - b)
}

function buildRrule(): string | undefined {
  if (form.value.repeat === 'none') return undefined
  const parts = [`FREQ=${form.value.repeat.toUpperCase()}`]
  const interval = Number(form.value.repeatInterval) || 1
  if (interval > 1) parts.push(`INTERVAL=${interval}`)
  if (form.value.repeat === 'weekly' && form.value.repeatDays.length > 0) {
    parts.push(`BYDAY=${[...form.value.repeatDays].sort((a, b) => a - b).map(d => DAY_TOKENS[d]).join(',')}`)
  }
  if (form.value.repeatEnds === 'count') {
    const count = Number(form.value.repeatCount)
    if (count >= 2) parts.push(`COUNT=${count}`)
  } else if (form.value.repeatUntil) {
    parts.push(`UNTIL=${form.value.repeatUntil}`)
  }
  return parts.join(';')
}

const recurrencePreview = computed(() => {
  if (form.value.repeat === 'none') return ''
  const on = form.value.repeat === 'weekly' && form.value.repeatDays.length > 0
    ? ` on ${form.value.repeatDays.map(d => DAY_LABELS[d]).join(', ')}`
    : ''
  const ends = form.value.repeatEnds === 'count'
    ? `, ${Number(form.value.repeatCount) || 10} times`
    : form.value.repeatUntil ? `, until ${form.value.repeatUntil}` : ''
  return `Repeats ${intervalUnit.value}${on}${ends}.`
})

const seriesNotice = ref('')

// Categories for the calendar grouping (plan §8.2).
interface Category { id: string, code: string, name: string, color: string }
const categories = ref<Category[]>([])

onMounted(async () => {
  events.fetchEvents()
  try {
    categories.value = await api.get<Category[]>('/reference/categories')
  } catch {
    // Optional: without the list the form simply has no category choices.
  }
  try {
    const academic = await api.get<{ colleges: CollegeOption[], sections: SectionOption[] }>('/reference/academic')
    colleges.value = academic.colleges ?? []
    sections.value = academic.sections ?? []
  } catch {
    // Optional: the audience pickers stay empty without the reference data.
  }
})

async function handleCreate() {
  const dateTime = `${form.value.date}T${form.value.time}:00`
  const created = await events.createEvent({
    title: form.value.title,
    date: dateTime,
    lat: parseFloat(form.value.lat),
    lng: parseFloat(form.value.lng),
    radiusMeters: parseInt(form.value.radiusMeters),
    categoryId: form.value.categoryId || null,
    capacity: form.value.capacity ? Number(form.value.capacity) : null,
    registrationRequired: form.value.registrationRequired,
    rrule: buildRrule(),
    ...buildAudienceFields()
  }) as { occurrenceCount?: number }
  seriesNotice.value = (created?.occurrenceCount ?? 1) > 1
    ? `Series created — ${created.occurrenceCount} occurrences on the calendar.`
    : ''
  showCreate.value = false
  form.value = {
    title: '',
    date: '',
    time: '',
    lat: '',
    lng: '',
    radiusMeters: '50',
    categoryId: '',
    capacity: '',
    registrationRequired: false,
    repeat: 'none',
    repeatInterval: '1',
    repeatDays: [],
    repeatEnds: 'count',
    repeatCount: '10',
    repeatUntil: '',
    audienceType: 'all',
    audienceCollegeId: '',
    audienceYearLevel: '',
    audienceSectionId: ''
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-navy font-serif">
          Events
        </h1>
        <p class="text-sm text-slate">
          Manage USC events and attendance
        </p>
      </div>
      <Button v-if="auth.isStaff" variant="gold" @click="showCreate = !showCreate">
        {{ showCreate ? 'Cancel' : '+ Create Event' }}
      </Button>
    </div>

    <!-- Create Event Form -->
    <Card v-if="showCreate">
      <CardHeader>
        <CardTitle>New Event</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="handleCreate">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2 md:col-span-2">
              <Label>Event Title</Label>
              <Input v-model="form.title" placeholder="General Assembly — July Session" required />
            </div>
            <div class="space-y-2">
              <Label>Date</Label>
              <Input v-model="form.date" type="date" required />
            </div>
            <div class="space-y-2">
              <Label>Time</Label>
              <Input v-model="form.time" type="time" required />
            </div>
            <div class="space-y-2">
              <Label>Radius (meters)</Label>
              <Input v-model="form.radiusMeters" type="number" placeholder="50" />
            </div>
          </div>

          <div class="space-y-2">
            <Label>Venue Location</Label>
            <LocationPicker
              v-model:lat="form.lat"
              v-model:lng="form.lng"
              :radius-meters="parseInt(form.radiusMeters) || 50"
              height="280px"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="space-y-2">
              <Label>Category</Label>
              <select v-model="form.categoryId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                <option value="">
                  Uncategorised
                </option>
                <option v-for="c in categories" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select>
            </div>
            <div class="space-y-2">
              <Label>Capacity (optional)</Label>
              <Input v-model="form.capacity" type="number" placeholder="Unlimited" />
            </div>
            <label class="flex items-end gap-2 pb-2 text-sm text-slate">
              <input v-model="form.registrationRequired" type="checkbox">
              Registration required
            </label>
          </div>

          <div class="rounded-lg border border-line bg-paper-panel/50 p-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="space-y-2">
                <Label>Repeats</Label>
                <select v-model="form.repeat" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="none">
                    Does not repeat
                  </option>
                  <option value="daily">
                    Daily
                  </option>
                  <option value="weekly">
                    Weekly
                  </option>
                  <option value="monthly">
                    Monthly
                  </option>
                </select>
              </div>
              <div v-if="form.repeat !== 'none'" class="space-y-2">
                <Label>Interval</Label>
                <div class="flex items-center gap-2">
                  <Input v-model="form.repeatInterval" type="number" class="w-24" />
                  <span class="text-sm text-slate">{{ intervalUnit }}</span>
                </div>
              </div>
              <div v-if="form.repeat !== 'none'" class="space-y-2">
                <Label>Ends</Label>
                <select v-model="form.repeatEnds" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="count">
                    After a number of occurrences
                  </option>
                  <option value="date">
                    On a date
                  </option>
                </select>
              </div>
            </div>

            <div v-if="form.repeat === 'weekly'" class="space-y-2">
              <Label>On these days (empty = the event's own weekday)</Label>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="(_, index) in DAY_LABELS"
                  :key="index"
                  type="button"
                  class="rounded-lg border px-2.5 py-1 text-xs font-semibold"
                  :class="form.repeatDays.includes(index) ? 'border-navy bg-navy text-white' : 'border-line text-slate hover:bg-paper'"
                  @click="toggleRepeatDay(index)"
                >
                  {{ dayLabel(index) }}
                </button>
              </div>
            </div>

            <div v-if="form.repeat !== 'none' && form.repeatEnds === 'count'" class="space-y-2">
              <Label>Occurrences (2–200)</Label>
              <Input
                v-model="form.repeatCount"
                type="number"
                min="2"
                max="200"
              />
            </div>
            <div v-if="form.repeat !== 'none' && form.repeatEnds === 'date'" class="space-y-2">
              <Label>Until</Label>
              <Input v-model="form.repeatUntil" type="date" />
            </div>

            <p v-if="form.repeat !== 'none'" class="text-xs text-slate">
              {{ recurrencePreview }} Each occurrence is a real event, so attendance and registration are taken per session.
            </p>
          </div>

          <div v-if="seriesNotice" class="rounded-lg border border-success bg-success/10 px-4 py-3 text-sm text-navy">
            {{ seriesNotice }}
          </div>

          <div class="rounded-lg border border-line bg-paper-panel/50 p-4 space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label>Who must attend</Label>
                <select v-model="form.audienceType" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="all">
                    All students
                  </option>
                  <option value="college">
                    One college
                  </option>
                  <option value="yearLevel">
                    One year level
                  </option>
                  <option value="section">
                    One section
                  </option>
                </select>
              </div>
              <div v-if="form.audienceType === 'college'" class="space-y-2">
                <Label>College</Label>
                <select v-model="form.audienceCollegeId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="">
                    Pick a college…
                  </option>
                  <option v-for="c in colleges" :key="c.id" :value="c.id">
                    {{ c.code ? `${c.code} · ${c.name}` : c.name }}
                  </option>
                </select>
              </div>
              <div v-if="form.audienceType === 'yearLevel'" class="space-y-2">
                <Label>Year level</Label>
                <select v-model="form.audienceYearLevel" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="">
                    Pick a year…
                  </option>
                  <option v-for="year in [1, 2, 3, 4, 5, 6]" :key="year" :value="String(year)">
                    Year {{ year }}
                  </option>
                </select>
              </div>
              <div v-if="form.audienceType === 'section'" class="space-y-2">
                <Label>Section</Label>
                <select v-model="form.audienceSectionId" class="w-full rounded-lg border border-line px-3 py-2 text-sm">
                  <option value="">
                    Pick a section…
                  </option>
                  <option v-for="s in sections" :key="s.id" :value="s.id">
                    {{ s.name }} (Year {{ s.yearLevel }})
                  </option>
                </select>
              </div>
            </div>
            <p class="text-xs text-slate">
              {{ audienceLabel }} This decides the turnout denominator and, later, who absence fines apply to.
            </p>
          </div>

          <div class="flex items-end">
            <Button type="submit" variant="default" class="w-full">
              Create Event
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <!-- Event List -->
    <div v-if="events.loading" class="text-center text-slate py-12">
      Loading events...
    </div>
    <div v-else-if="events.events.length === 0" class="text-center text-slate py-12">
      No events yet. Create one to get started.
    </div>
    <div v-else class="space-y-3">
      <Card
        v-for="event in events.events"
        :key="event.id"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push(`/manage/events/${event.id}`)"
      >
        <CardContent class="p-4 flex items-center justify-between">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-navy">{{ event.title }}</span>
              <span
                v-if="(event as { category?: { name: string, color: string } | null }).category"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                :style="{ backgroundColor: (event as { category?: { name: string, color: string } | null }).category?.color }"
              >
                {{ (event as { category?: { name: string, color: string } | null }).category?.name }}
              </span>
            </div>
            <div class="text-sm text-slate">
              {{ formatDate(event.date) }} · {{ formatTime(event.date) }}
            </div>
            <div class="text-xs text-slate mt-1">
              Radius: {{ event.radiusMeters }}m
            </div>
          </div>
          <div class="text-right">
            <Badge variant="default">
              {{ (event as any)._count?.attendance ?? 0 }} checked in
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
