import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/pages/DashboardPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/events',
      name: 'events',
      component: () => import('@/pages/EventsPage.vue'),
      meta: { requiresAuth: true, roles: ['super_admin', 'staff'] },
    },
    {
      path: '/events/:id',
      name: 'event-detail',
      component: () => import('@/pages/EventDetailPage.vue'),
      meta: { requiresAuth: true, roles: ['super_admin', 'staff'] },
    },
    {
      path: '/check-in',
      name: 'check-in',
      component: () => import('@/pages/CheckInPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/check-in/:eventId',
      name: 'check-in-event',
      component: () => import('@/pages/CheckInPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/attendance/:eventId',
      name: 'attendance',
      component: () => import('@/pages/AttendancePage.vue'),
      meta: { requiresAuth: true, roles: ['super_admin', 'staff'] },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.isAuthenticated && !auth.loading) {
    await auth.fetchUser()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  if (to.meta.roles && auth.user) {
    const allowed = to.meta.roles as string[]
    if (!allowed.includes(auth.user.role)) {
      return { name: 'dashboard' }
    }
  }

  return true
})

export default router
