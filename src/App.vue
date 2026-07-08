<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import PublicLayout from '@/components/layout/PublicLayout.vue'

const route = useRoute()
</script>

<template>
  <PublicLayout v-if="route.meta.layout === 'public'">
    <RouterView />
  </PublicLayout>
  <AppShell v-else>
    <RouterView />
  </AppShell>
</template>
