<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useOfflineQueue } from '@/composables/useOfflineQueue'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'

const auth = useAuthStore()
const { queueLength } = useOfflineQueue()
</script>

<template>
  <div class="min-h-screen bg-paper flex">
    <AppSidebar v-if="auth.isAuthenticated" />

    <div class="flex-1 flex flex-col min-h-screen">
      <AppHeader v-if="auth.isAuthenticated" />

      <main class="flex-1 p-4 md:p-6 lg:p-8">
        <div v-if="queueLength > 0" class="mb-4 rounded-lg border border-warning bg-gold/10 px-4 py-3 text-sm text-gold-dark flex items-center gap-2">
          <span class="font-mono text-xs bg-gold/20 rounded-full px-2 py-0.5">{{ queueLength }}</span>
          <span>check-in{{ queueLength > 1 ? 's' : '' }} pending sync — will upload when online</span>
        </div>
        <slot />
      </main>
    </div>
  </div>
</template>
