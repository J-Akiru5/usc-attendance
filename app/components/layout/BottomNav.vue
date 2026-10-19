<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

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
  { label: 'Home', to: '/dashboard', icon: '⊞', roles: ['super_admin', 'staff', 'client', 'student'] },
  { label: 'Events', to: '/manage/events', icon: '📅', roles: ['super_admin', 'staff'] },
  { label: 'Scan', to: '/scan', icon: '📷', roles: ['super_admin', 'staff'] },
  { label: 'Check In', to: '/check-in', icon: '📍', roles: ['super_admin', 'staff', 'client'] },
  { label: 'Duty', to: '/duty', icon: '🏠', roles: ['super_admin', 'staff', 'client'] }
]
</script>

<template>
  <nav aria-label="Primary" class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-navy-deep border-t border-white/10 safe-bottom">
    <div class="flex items-center justify-around h-16 relative">
      <template
        v-for="item in navItems.filter(i => i.roles.includes(auth.user?.role || ''))"
        :key="item.to"
      >
        <!-- Special Center Scan Button (Floating Action Button) -->
        <NuxtLink
          v-if="item.label === 'Scan'"
          :to="item.to"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          aria-label="Scan a student QR or ID"
          :class="cn(
            'flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-gold to-yellow-600 text-navy shadow-lg shadow-gold/30 hover:brightness-110 active:scale-95 transition-all z-10 border-4 border-navy-deep -translate-y-4'
          )"
        >
          <span class="text-2xl leading-none" aria-hidden="true">📷</span>
        </NuxtLink>

        <!-- Standard Nav Item -->
        <NuxtLink
          v-else
          :to="item.to"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          :class="cn(
            'flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[55px] min-h-11',
            isActive(item.to)
              ? 'text-gold'
              : 'text-white/75 active:text-white'
          )"
        >
          <span class="text-xl leading-none" aria-hidden="true">{{ item.icon }}</span>
          <span class="text-[10px] font-semibold tracking-wide uppercase">{{ item.label }}</span>
          <span
            v-if="isActive(item.to)"
            class="w-1 h-1 rounded-full bg-gold mt-0.5"
            aria-hidden="true"
          />
        </NuxtLink>
      </template>
    </div>
  </nav>
</template>

<style scoped>
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
