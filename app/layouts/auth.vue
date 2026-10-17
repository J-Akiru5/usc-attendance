<template>
  <div class="min-h-dvh flex flex-col items-center justify-center bg-default px-4 py-10">
    <NuxtLink to="/" class="mb-8 flex items-center gap-3">
      <img
        src="/logo/USC_logo.webp"
        alt="USC logo"
        class="size-12 rounded-full ring-2 ring-gold-500/40"
      >
      <span class="flex flex-col text-left leading-tight">
        <span class="font-serif text-lg font-semibold text-highlighted">University Student Council</span>
        <span class="text-xs uppercase tracking-widest text-muted">ISUFST Dingle Campus</span>
      </span>
    </NuxtLink>

    <slot />

    <p class="mt-8 text-center text-xs text-dimmed">
      Having trouble? Contact a USC officer for assistance.
    </p>
  </div>
</template>
