interface GuideEntry {
  question: string
  answer: string
}

interface GuideCategory {
  id: string
  title: string
  icon: string
  color: string
  entries: GuideEntry[]
}

/**
 * Ported from the legacy `src/composables/useCampusGuide.ts`; module-level
 * refs become `useState` (searchQuery is user input — it must not leak across
 * server requests), and the eager fetch stays client-only.
 */
export function useCampusGuide() {
  const categories = useState<GuideCategory[]>('campus-guide-categories', () => [])
  const loading = useState('campus-guide-loading', () => false)
  const loaded = useState('campus-guide-loaded', () => false)
  const error = useState<string | null>('campus-guide-error', () => null)
  const searchQuery = useState('campus-guide-search', () => '')

  async function fetchGuide() {
    if (loaded.value) return
    loading.value = true
    error.value = null
    try {
      const res = await fetch('/data/campus-guide.json')
      if (!res.ok) throw new Error(`Failed to fetch campus guide (${res.status})`)
      const data = await res.json()
      categories.value = data.categories
      loaded.value = true
    } catch (e) {
      console.error('Failed to load campus guide:', e)
      error.value = 'Unable to load campus guide. Please try again later.'
    } finally {
      loading.value = false
    }
  }

  const filteredCategories = computed(() => {
    const q = searchQuery.value.toLowerCase().trim()
    if (!q) return categories.value

    return categories.value
      .map((cat: GuideCategory) => ({
        ...cat,
        entries: cat.entries.filter(
          (e: GuideEntry) =>
            e.question.toLowerCase().includes(q)
            || e.answer.toLowerCase().includes(q)
        )
      }))
      .filter((cat: GuideCategory) => cat.entries.length > 0)
  })

  if (import.meta.client) fetchGuide()

  return {
    categories,
    loading,
    error,
    searchQuery,
    filteredCategories
  }
}
