import { ref, computed } from 'vue'

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

const categories = ref<GuideCategory[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')

export function useCampusGuide() {
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
      .map((cat) => ({
        ...cat,
        entries: cat.entries.filter(
          (e) =>
            e.question.toLowerCase().includes(q) ||
            e.answer.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.entries.length > 0)
  })

  fetchGuide()

  return {
    categories,
    loading,
    error,
    searchQuery,
    filteredCategories,
  }
}
