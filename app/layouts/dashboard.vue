<script setup lang="ts">
// Ported from the legacy `AppShell.vue` (P1c): same header/sidebar/bottom-nav
// chrome and the same pending-sync banner. The Pinia store call is identical
// because `useAuthStore` is a `useState`-backed composable with the same API.
//
// Accessibility (BC-13, WCAG 2.2 AA): this is the portal's only shell, so the
// skip link, the single `main` landmark, the live region for the offline queue
// and the shared focus ring live here rather than in global CSS (the public
// site's stylesheet is frozen — see docs/PUBLIC-SITE-FREEZE.md).
import { useAuthStore } from '@/stores/auth'
import { useOfflineQueue } from '@/composables/useOfflineQueue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import BottomNav from '@/components/layout/BottomNav.vue'
import PendingSignature from '@/components/PendingSignature.vue'

const auth = useAuthStore()
const { queueLength } = useOfflineQueue()
</script>

<template>
  <div id="portal-shell" class="min-h-screen bg-paper flex">
    <a id="portal-skip-link" href="#main-content">
      Skip to content
    </a>

    <AppSidebar v-if="auth.isAuthenticated" />

    <div class="flex-1 flex flex-col min-h-screen">
      <AppHeader v-if="auth.isAuthenticated" />

      <main id="main-content" tabindex="-1" class="flex-1 p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
        <div
          v-if="queueLength > 0"
          role="status"
          aria-live="polite"
          class="mb-4 rounded-lg border border-warning bg-gold/10 px-4 py-3 text-sm text-gold-dark flex items-center gap-2"
        >
          <span class="font-mono text-xs bg-gold/20 rounded-full px-2 py-0.5">{{ queueLength }}</span>
          <span>check-in{{ queueLength > 1 ? 's' : '' }} pending sync — will upload when online</span>
        </div>
        <slot />
      </main>
    </div>

    <BottomNav v-if="auth.isAuthenticated" />
    <PendingSignature v-if="auth.isAuthenticated && !auth.user?.mustChangePassword" />
  </div>
</template>

<style>
/*
 * Portal-only chrome. Kept out of app/assets/css/main.css because that file is
 * shared with the frozen public pages; this stylesheet is loaded with the
 * dashboard layout, which no public route uses.
 */
#portal-skip-link {
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 100;
  transform: translateY(-250%);
  border-radius: 0.5rem;
  background: #fff;
  color: #142850;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 700;
  box-shadow: 0 8px 24px rgb(12 27 54 / 0.25);
  transition: transform 120ms ease-out;
}

#portal-skip-link:focus,
#portal-skip-link:focus-visible {
  transform: translateY(0);
}

/*
 * A visible focus indicator on every portal control (WCAG 2.4.7). The navy
 * ring reads on white/paper, the gold halo reads on the navy sidebar and
 * header; neither colour is used as the sole indicator, so it survives
 * high-contrast preferences.
 */
#portal-shell :focus-visible {
  outline: 3px solid #142850;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #c9a24b;
}

#portal-shell #main-content:focus {
  outline: none;
  box-shadow: none;
}

/*
 * Portal contrast corrections (WCAG 1.4.3). The shared brand tokens are tuned
 * for large display text on the public site; at 12–14 px on the portal they
 * fall just under 4.5:1 when composited over their own 10% tint. Darken the
 * text colour inside the portal only — the public site's tokens stay frozen.
 */
#portal-shell .text-success {
  color: #2f6048;
}

#portal-shell .text-gold-dark {
  color: #6b5320;
}

@media (prefers-reduced-motion: reduce) {
  #portal-skip-link {
    transition: none;
  }
}
</style>
