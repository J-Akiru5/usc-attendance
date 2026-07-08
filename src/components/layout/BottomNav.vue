<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}

interface NavItem {
  label: string
  to: string
  icon: string
  roles: string[]
}

const navItems: NavItem[] = [
  { label: 'Home', to: '/', icon: '⊞', roles: ['super_admin', 'staff', 'client'] },
  { label: 'Events', to: '/events', icon: '📅', roles: ['super_admin', 'staff'] },
  { label: 'Check In', to: '/check-in', icon: '📍', roles: ['super_admin', 'staff', 'client'] },
  { label: 'Attendance', to: '/attendance', icon: '📋', roles: ['super_admin', 'staff'] },
]
</script>

<template>
  <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-navy-deep border-t border-white/10 safe-bottom">
    <div class="flex items-center justify-around h-16">
      <button
        v-for="item in navItems.filter(i => i.roles.includes(auth.user?.role || ''))"
        :key="item.to"
        @click="router.push(item.to)"
        :class="cn(
          'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[60px]',
          isActive(item.to)
            ? 'text-gold'
            : 'text-white/50 active:text-white'
        )"
      >
        <span class="text-xl leading-none">{{ item.icon }}</span>
        <span class="text-[10px] font-semibold tracking-wide uppercase">{{ item.label }}</span>
        <div
          v-if="isActive(item.to)"
          class="w-1 h-1 rounded-full bg-gold mt-0.5"
        />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
