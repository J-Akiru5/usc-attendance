import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { OfficeDuty, Attendance } from '@/types'

export const useDutyStore = defineStore('duties', () => {
  const duties = ref<OfficeDuty[]>([])
  const todayDuties = ref<OfficeDuty[]>([])
  const dutyAttendance = ref<Attendance[]>([])
  const loading = ref(false)

  const todayDayOfWeek = new Date().getDay()

  async function fetchDuties() {
    loading.value = true
    try {
      duties.value = await api.get<OfficeDuty[]>('/duties')
      todayDuties.value = duties.value.filter(
        (d) => d.dayOfWeek === todayDayOfWeek && d.active
      )
    } finally {
      loading.value = false
    }
  }

  async function fetchTodayDutyAttendance() {
    loading.value = true
    try {
      const result = await api.get<{ duties: OfficeDuty[]; attendance: Attendance[] }>(
        `/attendance/duty?date=${new Date().toISOString()}`
      )
      todayDuties.value = result.duties
      dutyAttendance.value = result.attendance
    } finally {
      loading.value = false
    }
  }

  async function checkInDuty(userId: string, lat?: number, lng?: number) {
    return api.post<Attendance>('/attendance/duty', {
      userId,
      lat,
      lng,
      recordedBy: userId,
      dutyDate: new Date().toISOString(),
    })
  }

  async function manualDutyCheckIn(userId: string, recordedBy: string) {
    return api.post<Attendance>('/attendance/duty', {
      userId,
      recordedBy,
      dutyDate: new Date().toISOString(),
    })
  }

  function hasDutyToday(userId: string) {
    return todayDuties.value.some((d) => d.userId === userId)
  }

  function getDutyForUser(userId: string) {
    return todayDuties.value.find((d) => d.userId === userId)
  }

  function isCheckedInForDuty(userId: string) {
    const today = new Date().toISOString().split('T')[0]
    return dutyAttendance.value.some(
      (a) => a.userId === userId && a.dutyDate?.startsWith(today)
    )
  }

  return {
    duties,
    todayDuties,
    dutyAttendance,
    loading,
    fetchDuties,
    fetchTodayDutyAttendance,
    checkInDuty,
    manualDutyCheckIn,
    hasDutyToday,
    getDutyForUser,
    isCheckedInForDuty,
  }
})
