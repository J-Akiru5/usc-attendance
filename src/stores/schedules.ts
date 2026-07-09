import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { OfficeDuty } from '@/types'

export const useScheduleStore = defineStore('schedules', () => {
  const schedules = ref<OfficeDuty[]>([])
  const loading = ref(false)

  async function fetchSchedules() {
    loading.value = true
    try {
      schedules.value = await api.get<OfficeDuty[]>('/schedules')
    } finally {
      loading.value = false
    }
  }

  async function createDutySchedule(data: { userId: string; dayOfWeek: number; startTime: string; endTime: string; active?: boolean }) {
    const schedule = await api.post<OfficeDuty>('/schedules', data)
    schedules.value.push(schedule)
    schedules.value.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
    return schedule
  }

  async function updateDutySchedule(id: string, data: Partial<{ userId: string; dayOfWeek: number; startTime: string; endTime: string; active: boolean }>) {
    const updated = await api.put<OfficeDuty>(`/schedules/${id}`, data)
    const idx = schedules.value.findIndex((s) => s.id === id)
    if (idx !== -1) schedules.value[idx] = updated
    schedules.value.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
    return updated
  }

  async function deleteDutySchedule(id: string) {
    await api.delete(`/schedules/${id}`)
    schedules.value = schedules.value.filter((s) => s.id !== id)
  }

  return {
    schedules,
    loading,
    fetchSchedules,
    createDutySchedule,
    updateDutySchedule,
    deleteDutySchedule,
  }
})
