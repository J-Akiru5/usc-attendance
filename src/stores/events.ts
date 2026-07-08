import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { USCEvent, Attendance } from '@/types'

export const useEventStore = defineStore('events', () => {
  const events = ref<USCEvent[]>([])
  const currentEvent = ref<USCEvent | null>(null)
  const attendance = ref<Attendance[]>([])
  const loading = ref(false)

  async function fetchEvents() {
    loading.value = true
    try {
      events.value = await api.get<USCEvent[]>('/events')
    } finally {
      loading.value = false
    }
  }

  async function fetchEvent(id: string) {
    loading.value = true
    try {
      currentEvent.value = await api.get<USCEvent>(`/events/${id}`)
    } finally {
      loading.value = false
    }
  }

  async function createEvent(data: Omit<USCEvent, 'id' | 'createdAt' | 'createdBy'>) {
    const event = await api.post<USCEvent>('/events', data)
    events.value.unshift(event)
    return event
  }

  async function fetchAttendance(eventId: string) {
    loading.value = true
    try {
      attendance.value = await api.get<Attendance[]>(`/attendance?eventId=${eventId}`)
    } finally {
      loading.value = false
    }
  }

  async function checkIn(eventId: string, userId: string, lat: number, lng: number) {
    return api.post<Attendance>('/attendance', {
      eventId,
      userId,
      method: 'self',
      lat,
      lng,
      recordedBy: userId,
    })
  }

  async function manualCheckIn(eventId: string, userId: string, recordedBy: string) {
    return api.post<Attendance>('/attendance', {
      eventId,
      userId,
      method: 'manual',
      recordedBy,
    })
  }

  return {
    events,
    currentEvent,
    attendance,
    loading,
    fetchEvents,
    fetchEvent,
    createEvent,
    fetchAttendance,
    checkIn,
    manualCheckIn,
  }
})
