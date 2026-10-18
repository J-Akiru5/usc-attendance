import { api } from '@/lib/api'
import type { Attendance, OfficeDuty } from '@/types'

/** Ported from the legacy Pinia store — same API, `useState`-backed, `reactive()`-unwrapped. */
export function useDutyStore() {
  const duties = useState<OfficeDuty[]>('duties:list', () => [])
  const todayDuties = useState<OfficeDuty[]>('duties:today', () => [])
  const dutyAttendance = useState<Attendance[]>('duties:attendance', () => [])
  const loading = useState('duties:loading', () => false)

  const todayDayOfWeek = new Date().getDay()

  async function fetchDuties() {
    loading.value = true
    try {
      duties.value = await api.get<OfficeDuty[]>('/duties')
      todayDuties.value = duties.value.filter(
        d => d.dayOfWeek === todayDayOfWeek && d.active
      )
    } catch {
      duties.value = []
      todayDuties.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchTodayDutyAttendance() {
    loading.value = true
    try {
      const result = await api.get<{ duties: OfficeDuty[], attendance: Attendance[] }>(
        `/attendance/duty?date=${new Date().toISOString()}`
      )
      todayDuties.value = result.duties
      dutyAttendance.value = result.attendance
    } catch {
      todayDuties.value = []
      dutyAttendance.value = []
    } finally {
      loading.value = false
    }
  }

  async function checkInDuty(userId: string, lat?: number, lng?: number) {
    return api.post<Attendance>('/attendance/duty', {
      userId,
      lat,
      lng,
      dutyDate: new Date().toISOString()
    })
  }

  async function manualDutyCheckIn(userId: string) {
    return api.post<Attendance>('/attendance/duty', {
      userId,
      dutyDate: new Date().toISOString()
    })
  }

  async function checkOutDuty(userId: string) {
    return api.post<Attendance>('/attendance/checkout', {
      userId,
      dutyDate: new Date().toISOString()
    })
  }

  function hasDutyToday(userId: string) {
    return todayDuties.value.some(d => d.userId === userId)
  }

  function getDutyForUser(userId: string) {
    return todayDuties.value.find(d => d.userId === userId)
  }

  function isCheckedInForDuty(userId: string) {
    const today = new Date().toISOString().split('T')[0]
    return dutyAttendance.value.some(
      a => a.userId === userId && a.dutyDate?.startsWith(today ?? '') && !a.checkOutAt
    )
  }

  function isCheckedOutForDuty(userId: string) {
    const today = new Date().toISOString().split('T')[0]
    return dutyAttendance.value.some(
      a => a.userId === userId && a.dutyDate?.startsWith(today ?? '') && a.checkOutAt
    )
  }

  return reactive({
    duties,
    todayDuties,
    dutyAttendance,
    loading,
    fetchDuties,
    fetchTodayDutyAttendance,
    checkInDuty,
    manualDutyCheckIn,
    checkOutDuty,
    hasDutyToday,
    getDutyForUser,
    isCheckedInForDuty,
    isCheckedOutForDuty
  })
}
