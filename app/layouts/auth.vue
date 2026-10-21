<template>
  <div id="auth-shell" class="min-h-dvh flex flex-col items-center justify-center bg-default px-4 py-10">
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

    <main class="w-full flex flex-col items-center">
      <slot />
    </main>

    <p class="mt-8 text-center text-xs text-muted">
      Having trouble? Contact a USC officer for assistance.
    </p>
    <p class="mt-2 text-center text-xs text-muted">
      <NuxtLink
        to="/privacy-rights"
        class="font-semibold text-highlighted underline decoration-gold-500/60 underline-offset-2"
      >
        Privacy &amp; your rights
      </NuxtLink>
      — what the portal records and how to exercise your rights.
    </p>
  </div>
</template>

<style>
/* Same visible focus indicator as the portal shell (WCAG 2.4.7). Auth layout
   only; the public site's stylesheet stays untouched. */
#auth-shell :focus-visible {
  outline: 3px solid #142850;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #c9a24b;
}
</style>
