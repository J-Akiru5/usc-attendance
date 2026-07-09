import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, api } from '@/lib/api'
import type { User, Role } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!user.value)
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')
  const isStaff = computed(() => user.value?.role === 'staff' || user.value?.role === 'super_admin')
  const isClient = computed(() => user.value?.role === 'client')
  const role = computed(() => user.value?.role as Role | undefined)

  async function fetchUser() {
    loading.value = true
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      user.value = null
      loading.value = false
      return
    }
    try {
      const data = await api.get<User>('/auth/me')
      user.value = data
    } catch {
      user.value = null
    }
    loading.value = false
  }

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    await fetchUser()
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
    user.value = null
  }

  async function updateProfile(name: string, position: string) {
    const res = await api.put<{ user: User }>('/auth/profile', { name, position })
    user.value = res.user
    return res.user
  }

  return {
    user,
    loading,
    isAuthenticated,
    isSuperAdmin,
    isStaff,
    isClient,
    role,
    fetchUser,
    login,
    logout,
    updateProfile,
  }
})
