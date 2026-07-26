import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, api } from '@/lib/api'
import type { User, Role } from '@/types'

const DEV_FALLBACK_CREDENTIALS: Record<string, { password: string; user: User }> = {
  'admin@usc.edu.ph': {
    password: 'password123',
    user: {
      id: 'dev-admin-00000000-0000-0000-0000-000000000001',
      email: 'admin@usc.edu.ph',
      name: 'USC Admin',
      position: 'System Administrator',
      role: 'super_admin',
      createdAt: new Date().toISOString(),
    },
  },
}

const DEV_USER_KEY = 'usc-dev-user'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!user.value)
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')
  const isStaff = computed(() => user.value?.role === 'staff' || user.value?.role === 'super_admin')
  const isClient = computed(() => user.value?.role === 'client')
  const role = computed(() => user.value?.role as Role | undefined)

  function isDevMode() {
    return import.meta.env.DEV
  }

  function getDevUser(): User | null {
    if (!isDevMode()) return null
    try {
      const raw = localStorage.getItem(DEV_USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  function setDevUser(u: User | null) {
    if (u) {
      localStorage.setItem(DEV_USER_KEY, JSON.stringify(u))
    } else {
      localStorage.removeItem(DEV_USER_KEY)
    }
  }

  async function fetchUser() {
    loading.value = true

    // Dev fallback: check localStorage for mock user
    const devUser = getDevUser()
    if (devUser) {
      user.value = devUser
      loading.value = false
      return
    }

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

    if (error) {
      // Dev fallback: allow login with known credentials when Supabase fails
      if (isDevMode()) {
        const fallback = DEV_FALLBACK_CREDENTIALS[email]
        if (fallback && password === fallback.password) {
          user.value = fallback.user
          setDevUser(fallback.user)
          return { user: fallback.user }
        }
      }
      throw error
    }

    await fetchUser()
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
    setDevUser(null)
    user.value = null
  }

  async function updateProfile(name: string, position: string) {
    if (getDevUser()) {
      const updated = { ...user.value!, name, position }
      user.value = updated
      setDevUser(updated)
      return updated
    }
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
