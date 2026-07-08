<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'

const auth = useAuthStore()
const router = useRouter()

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <header class="bg-paper-panel border-b border-line px-4 md:px-6 py-3 flex items-center justify-between">
    <div class="flex items-center gap-3 md:hidden">
      <div class="w-8 h-8 rounded-full bg-navy border-2 border-gold flex items-center justify-center text-gold font-bold text-[10px]">
        USC
      </div>
      <span class="text-xs font-mono tracking-widest uppercase text-navy">Attendance</span>
    </div>

    <div class="hidden md:block" />

    <div class="flex items-center gap-4">
      <div class="text-right hidden sm:block">
        <div class="text-sm font-semibold text-navy">{{ auth.user?.name }}</div>
        <div class="text-xs text-slate">{{ auth.user?.position }}</div>
      </div>
      <Button variant="ghost" size="sm" @click="handleLogout">
        Logout
      </Button>
    </div>
  </header>
</template>
