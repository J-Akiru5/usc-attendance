import { api } from '@/lib/api'
import type { Attendance, USCEvent } from '@/types'

/** What the portal's create-event form may send (plan §8.2's calendar fields). */
export interface EventCreateInput extends Omit<USCEvent, 'id' | 'createdAt' | 'createdBy'> {
  categoryId?: string | null
  capacity?: number | null
  registrationRequired?: boolean
  /** RFC 5545 subset for a recurring series (plan §8.2); empty = a one-off. */
  rrule?: string
}

/** Ported from the legacy Pinia store — same API, `useState`-backed, `reactive()`-unwrapped. */
export function useEventStore() {
  const events = useState<USCEvent[]>('events:list', () => [])
  const currentEvent = useState<USCEvent | null>('events:current', () => null)
  const attendance = useState<Attendance[]>('events:attendance', () => [])
  const loading = useState('events:loading', () => false)

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

  async function createEvent(data: EventCreateInput) {
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
      lng
    })
  }

  async function manualCheckIn(eventId: string, userId: string) {
    return api.post<Attendance>('/attendance', {
      eventId,
      userId,
      method: 'manual'
    })
  }

  async function checkOut(eventId: string, userId: string) {
    return api.post<Attendance>('/attendance/checkout', { eventId, userId })
  }

  async function manualCheckOut(eventId: string, userId: string) {
    return api.post<Attendance>('/attendance/checkout', { eventId, userId })
  }

  return reactive({
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
    checkOut,
    manualCheckOut
  })
}
