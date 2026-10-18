<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { api } from '@/lib/api'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

/**
 * The officer calendar (plan §8.2): month / week / list views over the same
 * events the rest of the portal uses, coloured by category, click-through to
 * the event. FullCalendar is loaded on the client only — it is a DOM library.
 */
definePageMeta({ layout: 'dashboard', requiresAuth: true, roles: ['super_admin', 'staff', 'client'] })

interface Category { id: string, code: string, name: string, color: string }
interface EventRow {
  id: string
  title: string
  date: string
  checkInClosesAt?: string | null
  category?: Category | null
  _count?: { attendance: number }
}

const calendarComponent = shallowRef<unknown>(null)
const plugins = shallowRef<unknown[]>([])
const categories = ref<Category[]>([])
const categoryFilter = ref('')
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const [{ default: FullCalendar }, dayGrid, timeGrid, list, interaction] = await Promise.all([
      import('@fullcalendar/vue3'),
      import('@fullcalendar/daygrid'),
      import('@fullcalendar/timegrid'),
      import('@fullcalendar/list'),
      import('@fullcalendar/interaction')
    ])
    calendarComponent.value = FullCalendar
    plugins.value = [dayGrid.default, timeGrid.default, list.default, interaction.default]
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Could not load the calendar'
  }
  try {
    categories.value = await api.get<Category[]>('/reference/categories')
  } catch {
    // Without the category list the calendar still works, just unstyled.
  } finally {
    loading.value = false
  }
})

const options = computed(() => ({
  plugins: plugins.value,
  initialView: 'dayGridMonth',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,listMonth'
  },
  height: 'auto' as const,
  firstDay: 0,
  navLinks: true,
  nowIndicator: true,
  dayMaxEvents: 3,
  events: async (
    info: { start: Date, end: Date },
    success: (rows: unknown[]) => void,
    failure: (err: Error) => void
  ) => {
    try {
      const params = new URLSearchParams({ from: info.start.toISOString(), to: info.end.toISOString() })
      if (categoryFilter.value) params.set('categoryId', categoryFilter.value)
      const rows = await api.get<EventRow[]>(`/events?${params.toString()}`)
      success(rows.map(row => ({
        id: row.id,
        title: row.title,
        start: row.date,
        backgroundColor: row.category?.color ?? '#142850',
        borderColor: row.category?.color ?? '#142850',
        extendedProps: { category: row.category?.name ?? '', attendance: row._count?.attendance ?? 0 }
      })))
    } catch (err: unknown) {
      failure(err instanceof Error ? err : new Error(String(err)))
    }
  },
  eventClick: (info: { event: { id: string } }) => {
    void navigateTo(`/manage/events/${info.event.id}`)
  },
  eventDidMount: (info: { el: HTMLElement, event: { extendedProps: { category?: string, attendance?: number } } }) => {
    const { category, attendance } = info.event.extendedProps
    info.el.title = [info.el.title, category, `${attendance ?? 0} checked in`].filter(Boolean).join(' · ')
  }
}))
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-navy font-serif">
          Calendar
        </h1>
        <p class="text-sm text-slate">
          Every event by month, week or list — coloured by category. Click an event to open it.
        </p>
      </div>
      <label class="text-xs text-slate">
        Category
        <select v-model="categoryFilter" class="ml-2 rounded-lg border border-line px-2 py-1.5 text-sm">
          <option value="">All</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
    </div>

    <div v-if="error" class="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>

    <Card>
      <CardContent class="p-3 sm:p-4">
        <div v-if="loading" class="py-10 text-center text-sm text-slate">
          Loading…
        </div>
        <ClientOnly v-else>
          <component :is="calendarComponent" v-if="calendarComponent" :options="options" />
          <div v-else class="py-10 text-center text-sm text-slate">
            Calendar unavailable in this browser.
          </div>
        </ClientOnly>
      </CardContent>
    </Card>

    <div v-if="categories.length" class="flex flex-wrap gap-3 text-xs text-slate">
      <span v-for="c in categories" :key="c.id" class="flex items-center gap-1.5">
        <span class="inline-block h-3 w-3 rounded-sm" :style="{ backgroundColor: c.color }" />
        {{ c.name }}
      </span>
    </div>
  </div>
</template>
