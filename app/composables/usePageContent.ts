import { ref, onMounted } from 'vue'

export function usePageContent(page: string) {
  const content = ref<Record<string, unknown>>({})
  const loading = ref(true)
  const error = ref<string | null>(null)
  const found = ref(false)

  async function fetchContent() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`/api/cms/content?page=${encodeURIComponent(page)}`)
      if (res.ok) {
        content.value = await res.json()
        found.value = true
      } else {
        content.value = {}
        found.value = false
      }
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to load content'
      content.value = {}
      found.value = false
    } finally {
      loading.value = false
    }
  }

  onMounted(fetchContent)

  return { content, loading, error, found }
}
