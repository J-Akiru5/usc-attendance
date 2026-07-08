import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/api'
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

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (error || !data) {
      user.value = null
    } else {
      user.value = data as User
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
  }
})
