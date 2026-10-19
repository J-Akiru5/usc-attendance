<script setup lang="ts">
import type { DataTableColumn, SavedView } from '@/composables/useDataTable'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'

/**
 * Server-side data table (plan §8.1): the toolbar carries the search box, the
 * page's own filters (slot), the column chooser, saved views and the export;
 * the rows, paging and sorting all come from `useDataTable` via props.
 */
interface Props {
  title?: string
  columns: DataTableColumn[]
  rows: unknown[]
  total: number
  loading: boolean
  error?: string
  page: number
  pageCount: number
  pageSize: number
  sort: string
  dir: 'asc' | 'desc'
  q: string
  visibleColumns: string[]
  views: SavedView[]
  hasFilters: boolean
  emptyText?: string
  exportLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  error: '',
  emptyText: 'Nothing matches the current filters.',
  exportLabel: 'Export CSV'
})

const emit = defineEmits<{
  'update:q': [value: string]
  'sort': [key: string]
  'page': [value: number]
  'toggle-column': [key: string]
  'clear-filters': []
  'save-view': [name: string]
  'apply-view': [view: SavedView]
  'update-view': [id: string]
  'delete-view': [id: string]
  'export': []
}>()

const showChooser = ref(false)
const showViews = ref(false)
const newViewName = ref('')
const uid = useId()
const searchId = `datatable-search-${uid}`
const viewNameId = `datatable-view-name-${uid}`

const shown = computed(() => props.columns.filter(c => props.visibleColumns.includes(c.key)))

function saveCurrentView() {
  const name = newViewName.value.trim()
  if (!name) return
  emit('save-view', name)
  newViewName.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <label :for="searchId" class="sr-only">Search</label>
      <input
        :id="searchId"
        :value="q"
        type="search"
        placeholder="Search…"
        class="w-full sm:w-64 rounded-lg border border-line px-3 py-2 text-sm"
        @input="emit('update:q', ($event.target as HTMLInputElement).value)"
      >

      <slot name="filters" />

      <div class="relative ml-auto flex items-center gap-2">
        <Button
          v-if="hasFilters"
          variant="ghost"
          size="sm"
          @click="emit('clear-filters')"
        >
          Clear
        </Button>

        <Button
          variant="outline"
          size="sm"
          :disabled="loading"
          @click="emit('export')"
        >
          {{ exportLabel }}
        </Button>

        <Button
          variant="outline"
          size="sm"
          :aria-expanded="showChooser"
          @click="showChooser = !showChooser"
        >
          Columns
        </Button>
        <div v-if="showChooser" class="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-line bg-white p-2 shadow-lg">
          <label
            v-for="column in columns"
            :key="column.key"
            class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-navy hover:bg-paper"
          >
            <input
              type="checkbox"
              :checked="visibleColumns.includes(column.key)"
              :disabled="!column.hideable && visibleColumns.includes(column.key)"
              @change="emit('toggle-column', column.key)"
            >
            {{ column.label }}
          </label>
        </div>

        <Button
          variant="outline"
          size="sm"
          :aria-expanded="showViews"
          @click="showViews = !showViews"
        >
          Views <Badge v-if="views.length" variant="default" class="ml-1">
            {{ views.length }}
          </Badge>
        </Button>
        <div v-if="showViews" class="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-line bg-white p-3 shadow-lg space-y-2">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate">
            Saved views
          </div>
          <ul v-if="views.length" class="max-h-56 space-y-1 overflow-auto" tabindex="0">
            <li v-for="view in views" :key="view.id" class="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm">
              <button type="button" class="truncate text-navy hover:underline" @click="emit('apply-view', view); showViews = false">
                {{ view.name }}
              </button>
              <span class="flex items-center gap-1">
                <button
                  type="button"
                  class="inline-flex min-h-6 items-center text-xs text-slate hover:text-navy"
                  title="Overwrite with the current filters"
                  @click="emit('update-view', view.id)"
                >Save</button>
                <button type="button" class="inline-flex min-h-6 items-center text-xs text-danger hover:underline" @click="emit('delete-view', view.id)">Delete</button>
              </span>
            </li>
          </ul>
          <p v-else class="text-xs text-slate">
            No views yet — set your filters, then save them under a name.
          </p>
          <div class="flex items-center gap-2 border-t border-line pt-2">
            <label :for="viewNameId" class="sr-only">View name</label>
            <input
              :id="viewNameId"
              v-model="newViewName"
              placeholder="View name"
              class="w-full rounded-lg border border-line px-2 py-1.5 text-sm"
              @keyup.enter="saveCurrentView"
            >
            <Button
              variant="gold"
              size="sm"
              :disabled="!newViewName.trim()"
              @click="saveCurrentView"
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>

    <div
      class="overflow-x-auto rounded-xl border border-line bg-white"
      tabindex="0"
      role="region"
      :aria-label="title || 'Results table'"
    >
      <table class="w-full text-sm">
        <caption class="sr-only">
          {{ title || 'Results' }}
        </caption>
        <thead class="bg-paper">
          <tr>
            <th
              v-for="column in shown"
              :key="column.key"
              :aria-sort="column.sortable ? (sort === column.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined"
              class="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate whitespace-nowrap"
            >
              <button
                v-if="column.sortable"
                type="button"
                class="flex min-h-6 items-center gap-1 hover:text-navy"
                :aria-label="`Sort by ${column.label}`"
                @click="emit('sort', column.key)"
              >
                {{ column.label }}
                <span class="text-[9px]" aria-hidden="true">{{ sort === column.key ? (dir === 'asc' ? '▲' : '▼') : '↕' }}</span>
              </button>
              <template v-else>
                {{ column.label }}
              </template>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td :colspan="shown.length" class="px-3 py-8 text-center text-slate">
              Loading…
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td :colspan="shown.length" class="px-3 py-8 text-center text-slate">
              {{ emptyText }}
            </td>
          </tr>
          <tr
            v-for="row in rows"
            v-else
            :key="String((row as { id?: unknown }).id)"
            class="border-t border-line align-top"
          >
            <td v-for="column in shown" :key="column.key" class="px-3 py-2">
              <slot :name="`cell-${column.key}`" :row="row">
                {{ (row as Record<string, unknown>)[column.key] ?? '—' }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate">
      <span>{{ total }} row(s)</span>
      <span class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="page <= 1 || loading"
          @click="emit('page', page - 1)"
        >
          Prev
        </Button>
        Page {{ page }} / {{ pageCount }}
        <Button
          variant="outline"
          size="sm"
          :disabled="page >= pageCount || loading"
          @click="emit('page', page + 1)"
        >
          Next
        </Button>
      </span>
    </div>
  </div>
</template>
