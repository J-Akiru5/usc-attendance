<script setup lang="ts">
// Public site shell (home, about, events, …) — pages ported in P1.
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-default text-default">
    <!-- USC brand bar -->
    <header class="border-b border-default">
      <div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <img
            src="/logo/USC_logo.webp"
            alt="USC logo"
            class="size-8 rounded-full ring-2 ring-gold-500/40"
          >
          <span class="flex flex-col leading-tight">
            <span class="text-sm font-semibold text-highlighted">University Student Council</span>
            <span class="text-xs text-muted">ISUFST Dingle Campus</span>
          </span>
        </NuxtLink>

        <div class="flex items-center gap-2">
          <NuxtLink to="/login">
            <UButton color="primary" label="Portal" icon="i-lucide-log-in" />
          </NuxtLink>
          <UColorModeButton />
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-default py-6">
      <p class="text-center text-xs text-dimmed">
        © {{ new Date().getFullYear() }} University Student Council — ISUFST Dingle Campus
      </p>
    </footer>
  </div>
</template>
