<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter, useRoute } from 'vue-router'
import { cn } from '@/lib/utils'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const navItems = [
  { label: 'Dashboard', to: '/', icon: 'grid', roles: ['super_admin', 'staff', 'client'] },
  { label: 'Events', to: '/events', icon: 'calendar', roles: ['super_admin', 'staff'] },
  { label: 'Check In', to: '/check-in', icon: 'map-pin', roles: ['super_admin', 'staff', 'client'] },
]

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}
</script>

<template>
  <aside class="hidden md:flex w-60 flex-col bg-navy-deep text-white min-h-screen">
    <div class="p-6 border-b border-white/10">
      <div class="flex items-center gap-3">
        <img src="/logo-192.png" alt="USC Logo" class="w-10 h-10 rounded-full object-cover border border-gold" />
        <div>
          <div class="text-xs tracking-widest uppercase text-gold-soft font-mono">USC Attendance</div>
        </div>
      </div>
    </div>

    <nav class="flex-1 p-4 space-y-1">
      <template v-for="item in navItems" :key="item.to">
        <button
          v-if="item.roles.includes(auth.user?.role || '')"
          @click="router.push(item.to)"
          :class="cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            isActive(item.to)
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          )"
        >
          <span class="w-5 h-5 flex items-center justify-center text-xs opacity-70">
            {{ item.icon === 'grid' ? '⊞' : item.icon === 'calendar' ? '📅' : '📍' }}
          </span>
          {{ item.label }}
        </button>
      </template>
    </nav>

    <div class="p-4 border-t border-white/10">
      <div class="text-xs text-white/40 font-mono">ISUFST · Dingle Campus</div>
    </div>
  </aside>
</template>
