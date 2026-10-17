<script setup lang="ts">
// Supabase auth callback: the module exchanges the code / verifies the session
// on mount; once a user is present we continue to the saved redirect or home.
definePageMeta({
  layout: 'auth'
})

const user = useSupabaseUser()
const redirect = useSupabaseCookieRedirect()

watch(user, (value) => {
  if (value) {
    navigateTo(redirect.pluck() || '/')
  }
}, { immediate: true })
</script>

<template>
  <UCard class="w-full max-w-sm text-center">
    <template #header>
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary mx-auto" />
    </template>
    <p class="text-sm text-muted">
      Completing sign in…
    </p>
  </UCard>
</template>
