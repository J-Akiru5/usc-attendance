import { ref, computed } from 'vue'
import type { USCEvent } from '@/types/event'

const events = ref<USCEvent[]>([])
const loading = ref(false)
const loaded = ref(false)

export function useEvents() {
  async function fetchEvents() {
    if (loaded.value) return
    loading.value = true
    try {
      const res = await fetch('/data/events.json')
      const data: USCEvent[] = await res.json()
      events.value = data.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      loaded.value = true
    } catch (e) {
      console.error('Failed to load events:', e)
    } finally {
      loading.value = false
    }
  }

  const featuredEvent = computed(() => events.value.find((e) => e.featured) ?? null)

  const upcomingEvents = computed(() =>
    events.value.filter((e) => e.status === 'upcoming')
  )

  const pastEvents = computed(() =>
    events.value.filter((e) => e.status === 'completed')
  )

  function getCountdown(event: USCEvent) {
    const now = new Date()
    const target = new Date(event.date)
    const diff = target.getTime() - now.getTime()

    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
    const minutes = Math.floor((diff / (1000 * 60)) % 60)
    const seconds = Math.floor((diff / 1000) % 60)

    return { days, hours, minutes, seconds }
  }

  fetchEvents()

  return {
    events,
    loading,
    featuredEvent,
    upcomingEvents,
    pastEvents,
    getCountdown,
  }
}
