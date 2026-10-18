import { useDebounceFn } from '@vueuse/core'
import type { LocationQuery } from 'vue-router'
import { api } from '@/lib/api'

/**
 * Server-side data table state (plan §8.1): paging, sorting, free-text search
 * and filters live in the URL, so a table can be linked, bookmarked and saved
 * as a view; the rows always come from the server.
 */
export interface DataTableColumn {
  key: string
  label: string
  /** Server-side sortable. */
  sortable?: boolean
  /** Can be hidden from the column chooser. */
  hideable?: boolean
  /** Hidden by default (still available in the chooser). */
  hidden?: boolean
}

export interface SavedView {
  id: string
  name: string
  query: string
  updatedAt?: string
}

export interface DataTablePage<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export interface UseDataTableOptions<T> {
  /** Stable key used for saved views (`students`, `events`, …). */
  resource: string
  columns: DataTableColumn[]
  /** Extra URL-synced filters, e.g. `['collegeId', 'yearLevel']`. */
  filters?: string[]
  /** Fetches one page from the server for the current state. */
  fetcher: (query: Record<string, string>) => Promise<DataTablePage<T>>
  defaultSort?: string
  defaultDir?: 'asc' | 'desc'
  pageSize?: number
}

export function useDataTable<T>(options: UseDataTableOptions<T>) {
  const route = useRoute()
  const router = useRouter()

  /**
   * Two-way ref for one query parameter (the plan's URL-synced tables). Written
   * by hand instead of pulling `@vueuse/router` in for a single composable:
   * every state change replaces the URL, and a URL change (a saved view, a
   * pasted link, back/forward) updates the state.
   */
  type Widened<T> = T extends number ? number : string
  function queryRef<T extends string | number>(key: string, fallback: T): Ref<Widened<T>> {
    const isNumber = typeof fallback === 'number'
    const parse = (raw: unknown): Widened<T> => {
      if (raw === undefined || raw === null || raw === '') return fallback as Widened<T>
      return (isNumber ? Number(raw) : String(raw)) as Widened<T>
    }

    const state = ref(parse(route.query[key])) as Ref<Widened<T>>

    watch(() => route.query[key], (raw) => {
      const next = parse(raw)
      if (next !== state.value) state.value = next
    })

    watch(state, (value) => {
      if (parse(route.query[key]) === value) return
      // Rebuild without the key we are clearing (router.replace drops absent
      // params); spreading into a LocationQuery keeps the types honest.
      const query: LocationQuery = {}
      for (const [k, v] of Object.entries(route.query)) {
        if (k !== key) query[k] = v
      }
      if (value !== fallback && value !== '') query[key] = String(value)
      void router.replace({ query })
    })

    return state
  }

  const page = queryRef('page', 1)
  const pageSize = queryRef('pageSize', options.pageSize ?? 25)
  const sort = queryRef('sort', options.defaultSort ?? '')
  const dir = queryRef<'asc' | 'desc'>('dir', options.defaultDir ?? 'asc')
  const q = queryRef('q', '')
  const cols = queryRef('cols', '')

  const filterKeys = options.filters ?? []
  const filterValues = reactive<Record<string, string>>({})
  for (const key of filterKeys) {
    filterValues[key] = String(route.query[key] ?? '')
  }

  const rows = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const loading = ref(true)
  const error = ref('')

  const defaultVisible = options.columns.filter(c => !c.hidden).map(c => c.key)
  const visibleColumns = computed<string[]>(() => {
    if (!cols.value) return defaultVisible
    const chosen = cols.value.split(',').filter(k => options.columns.some(c => c.key === k))
    return chosen.length ? chosen : defaultVisible
  })

  function currentQuery(): Record<string, string> {
    const query: Record<string, string> = {}
    if (q.value) query.q = String(q.value)
    if (sort.value) query.sort = String(sort.value)
    if (dir.value && dir.value !== (options.defaultDir ?? 'asc')) query.dir = String(dir.value)
    if (page.value > 1) query.page = String(page.value)
    if (pageSize.value !== (options.pageSize ?? 25)) query.pageSize = String(pageSize.value)
    for (const key of filterKeys) {
      const value = filterValues[key]
      if (value) query[key] = String(value)
    }
    if (cols.value) query.cols = String(cols.value)
    return query
  }

  async function fetchPage() {
    loading.value = true
    error.value = ''
    try {
      const result = await options.fetcher(currentQuery())
      rows.value = result.rows
      total.value = result.total
      // Trust the server's clamping so the pager never lies.
      if (result.page !== page.value) page.value = result.page
      if (result.pageSize !== pageSize.value) pageSize.value = result.pageSize
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Could not load the rows'
      rows.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / (pageSize.value || 1))))

  function setPage(next: number) {
    page.value = Math.min(Math.max(1, next), pageCount.value)
  }

  function toggleSort(key: string) {
    if (!options.columns.find(c => c.key === key)?.sortable) return
    if (sort.value !== key) {
      sort.value = key
      dir.value = 'asc'
    } else if (dir.value === 'asc') {
      dir.value = 'desc'
    } else {
      sort.value = ''
      dir.value = options.defaultDir ?? 'asc'
    }
    page.value = 1
  }

  function setFilter(key: string, value: string) {
    filterValues[key] = value
    page.value = 1
  }

  function clearFilters() {
    q.value = ''
    for (const key of filterKeys) filterValues[key] = ''
    page.value = 1
  }

  const hasFilters = computed(() => !!q.value || filterKeys.some(k => filterValues[k]))

  function toggleColumn(key: string) {
    const current = new Set(visibleColumns.value)
    if (current.has(key)) {
      if (current.size <= 1) return
      current.delete(key)
    } else {
      current.add(key)
    }
    cols.value = options.columns.filter(c => current.has(c.key)).map(c => c.key).join(',')
  }

  // --- saved views ---------------------------------------------------------

  const views = ref<SavedView[]>([])
  const viewsLoading = ref(false)
  const viewsError = ref('')

  async function loadViews() {
    viewsLoading.value = true
    viewsError.value = ''
    try {
      views.value = await api.get<SavedView[]>(`/views?resource=${encodeURIComponent(options.resource)}`)
    } catch (err: unknown) {
      viewsError.value = err instanceof Error ? err.message : 'Could not load saved views'
    } finally {
      viewsLoading.value = false
    }
  }

  function queryStringOf(): string {
    return new URLSearchParams(currentQuery()).toString()
  }

  async function saveView(name: string) {
    const created = await api.post<SavedView>('/views', {
      resource: options.resource,
      name: name.trim(),
      query: queryStringOf()
    })
    await loadViews()
    return created
  }

  async function updateView(id: string) {
    await api.patch('/views', { id, query: queryStringOf() })
    await loadViews()
  }

  async function deleteView(id: string) {
    await api.delete('/views', { id })
    await loadViews()
  }

  /** Applies a saved view by navigating to its query string. */
  async function applyView(view: SavedView) {
    const parsed = Object.fromEntries(new URLSearchParams(view.query))
    await router.replace({ query: parsed })
  }

  // --- export --------------------------------------------------------------

  /** CSV of everything the current filter matches (paged through server-side). */
  async function exportCsv(filename: string, rowMapper: (row: T) => Record<string, unknown>) {
    const exportPageSize = 100
    const all: T[] = []
    let exportPage = 1
    for (;;) {
      const result = await options.fetcher({ ...currentQuery(), page: String(exportPage), pageSize: String(exportPageSize) })
      all.push(...result.rows)
      if (all.length >= result.total || result.rows.length === 0) break
      exportPage++
      if (exportPage > 200) break // hard stop, never loop forever
    }

    const keys = options.columns.filter(c => visibleColumns.value.includes(c.key))
    const escape = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value)
      // Neutralise spreadsheet formulas, same rule as the attendance export.
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
    }
    const lines = [
      keys.map(c => escape(c.label)).join(','),
      ...all.map((row) => {
        const mapped = rowMapper(row)
        return keys.map(c => escape(mapped[c.key])).join(',')
      })
    ]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    a.click()
    URL.revokeObjectURL(url)
    return all.length
  }

  // --- wiring --------------------------------------------------------------

  const debouncedFetch = useDebounceFn(fetchPage, 300)
  watch([page, pageSize, sort, dir], () => {
    void fetchPage()
  })
  watch(q, () => debouncedFetch())
  watch(() => filterKeys.map(k => filterValues[k]).join('|'), () => {
    page.value = 1
    void fetchPage()
  })
  onMounted(() => {
    void fetchPage()
    void loadViews()
  })

  return {
    rows,
    total,
    loading,
    error,
    page,
    pageSize,
    pageCount,
    sort,
    dir,
    q,
    filterValues,
    hasFilters,
    visibleColumns,
    columns: options.columns,
    setPage,
    toggleSort,
    setFilter,
    clearFilters,
    toggleColumn,
    refresh: fetchPage,
    views,
    viewsLoading,
    viewsError,
    loadViews,
    saveView,
    updateView,
    deleteView,
    applyView,
    currentQuery,
    queryStringOf,
    exportCsv
  }
}
