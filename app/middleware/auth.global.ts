import { useAuthStore } from '@/stores/auth'

/**
 * Ported from the legacy router's `beforeEach` guard (P1c).
 *
 * Runs on the client only: the legacy app was an SPA and the ported portal
 * pages fetch their data in `onMounted`, so there is nothing to gate
 * server-side — @nuxtjs/supabase still redirects anonymous visitors to /login
 * on the server (the public routes are excluded in nuxt.config).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const auth = useAuthStore()

  if (!auth.isAuthenticated) {
    await auth.fetchUser()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return navigateTo('/login')
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return navigateTo('/dashboard')
  }

  // Force password change — block everything except /change-password and logout
  if (auth.isAuthenticated && auth.user?.mustChangePassword && to.path !== '/change-password') {
    return navigateTo('/change-password')
  }

  const allowed = to.meta.roles as string[] | undefined
  if (allowed && auth.user) {
    // Pages flagged allowDelegates are open to any officer; the API decides
    // per event whether they hold an active grant.
    if (!allowed.includes(auth.user.role) && !to.meta.allowDelegates) {
      return navigateTo('/dashboard')
    }
  }

  return true
})
