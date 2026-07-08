import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public pages
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/HomePage.vue'),
      meta: { layout: 'public' },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/pages/AboutPage.vue'),
      meta: { layout: 'public' },
    },
    {
      path: '/features',
      name: 'features',
      component: () => import('@/pages/FeaturesPage.vue'),
      meta: { layout: 'public' },
    },
    {
      path: '/how-it-works',
      name: 'how-it-works',
      component: () => import('@/pages/HowItWorksPage.vue'),
      meta: { layout: 'public' },
    },
    {
      path: '/security',
      name: 'security',
      component: () => import('@/pages/SecurityPage.vue'),
      meta: { layout: 'public' },
    },
    {
      path: '/faq',
      name: 'faq',
      component: () => import('@/pages/FAQPage.vue'),
      meta: { layout: 'public' },
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('@/pages/ContactPage.vue'),
      meta: { layout: 'public' },
    },

    // Login
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { guest: true },
    },

    // Authenticated app
    {
      path: '/dashboard',
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
      path: '/qr',
      name: 'qr-code',
      component: () => import('@/pages/QRCodePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/scan',
      name: 'scanner',
      component: () => import('@/pages/ScannerPage.vue'),
      meta: { requiresAuth: true, roles: ['super_admin', 'staff'] },
    },
    {
      path: '/duty',
      name: 'duty',
      component: () => import('@/pages/DutyCheckInPage.vue'),
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

  if (!auth.isAuthenticated) {
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
