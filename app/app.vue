<script setup lang="ts">
const route = useRoute()

/**
 * Public-site freeze: the ported public pages must render exactly the DOM the
 * legacy SPA produced, so they are NOT wrapped in Nuxt UI's `UApp` (its
 * toaster/providers add regions that would change the accessibility tree).
 * Those pages don't use Nuxt UI components — the portal does, and keeps `UApp`.
 */
const isPublic = computed(() => route.meta.layout === 'public')

const colorMode = useColorMode()

const color = computed(() => colorMode.value === 'dark' ? '#142850' : '#ffffff')

useHead({
  meta: [
    { charset: 'utf-8' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const title = computed(() => isPublic.value
  ? 'University Student Council — ISUFST Dingle Campus'
  : 'USC Attendance — ISUFST')
const description = computed(() => isPublic.value
  ? 'Official website of the ISUFST Dingle Campus University Student Council. Explore events, campus guide, officer information, and the digital attendance portal.'
  : 'Attendance and event management system of the University Student Council — ISUFST Dingle Campus.')

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  ogImage: '/og-image.webp',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp v-if="!isPublic">
    <NuxtLoadingIndicator color="primary" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>

  <NuxtLayout v-else>
    <NuxtPage />
  </NuxtLayout>
</template>
