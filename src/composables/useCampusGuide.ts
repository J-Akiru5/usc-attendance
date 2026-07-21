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
const searchQuery = ref('')

export function useCampusGuide() {
  async function fetchGuide() {
    if (loaded.value) return
    loading.value = true
    try {
      const res = await fetch('/data/campus-guide.json')
      const data = await res.json()
      categories.value = data.categories
      loaded.value = true
    } catch (e) {
      console.error('Failed to load campus guide:', e)
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
    searchQuery,
    filteredCategories,
  }
}
