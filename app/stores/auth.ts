import { api } from '@/lib/api'
import type { Role, User } from '@/types'

/**
 * Ported from the legacy Pinia store (`src/stores/auth.ts`) — same API for the
 * pages, but state lives in `useState` so it is per-request on the server and
 * shared across components on the client, and the Supabase client comes from
 * @nuxtjs/supabase instead of a module-level instance. The return value is
 * wrapped in `reactive()` so refs unwrap exactly like Pinia's store proxy did
 * (pages read `auth.user?.name`, not `auth.user.value?.name`).
 */
export function useAuthStore() {
  const client = useSupabaseClient()
  const user = useState<User | null>('auth:user', () => null)
  const loading = useState('auth:loading', () => true)
  const lastAuthError = useState<string | null>('auth:last-error', () => null)

  const isAuthenticated = computed(() => !!user.value)
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')
  const isStaff = computed(() => user.value?.role === 'staff' || user.value?.role === 'super_admin')
  const isClient = computed(() => user.value?.role === 'client')
  const isStudent = computed(() => user.value?.role === 'student')
  // Super admin, President/Secretary (canDelegate) or anyone flagged canConfigure (adviser, officer in charge)
  const canManageSettings = computed(
    () => user.value?.role === 'super_admin' || user.value?.canDelegate === true || user.value?.canConfigure === true
  )
  const role = computed(() => user.value?.role as Role | undefined)

  async function fetchUser() {
    loading.value = true

    const { data: { session } } = await client.auth.getSession()
    if (!session) {
      user.value = null
      loading.value = false
      return
    }
    try {
      const data = await api.get<User>('/auth/me')
      user.value = data
      lastAuthError.value = null
    } catch (err: unknown) {
      user.value = null
      lastAuthError.value = err instanceof Error ? err.message : String(err)
    }
    loading.value = false
  }

  async function login(email: string, password: string) {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    })

    if (error) throw error

    await fetchUser()
    if (!user.value) {
      throw new Error(
        'Signed in, but your account could not be loaded'
        + (lastAuthError.value ? `: ${lastAuthError.value}` : '')
      )
    }
    return data
  }

  async function logout() {
    await client.auth.signOut()
    user.value = null
  }

  async function updateProfile(name: string, position: string) {
    const res = await api.put<{ user: User }>('/auth/profile', { name, position })
    user.value = res.user
    return res.user
  }

  return reactive({
    user,
    loading,
    lastAuthError,
    isAuthenticated,
    isSuperAdmin,
    isStaff,
    isClient,
    isStudent,
    canManageSettings,
    role,
    fetchUser,
    login,
    logout,
    updateProfile
  })
}
