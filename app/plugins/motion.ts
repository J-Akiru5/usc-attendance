/**
 * `v-motion` shim for the frozen public pages.
 *
 * The legacy site registered `@vueuse/motion`'s MotionPlugin. Those enter
 * animations (opacity/offset -> visible) are purely decorative: the parity gate
 * disables animations and screenshots the settled page, so the port only has to
 * render the *final* state — which is what a directive that applies no initial
 * styles and does nothing on mount produces, on the server and client alike.
 *
 * The one thing that must be reproduced is the inline `transform:
 * translateZ(0)` + `opacity: 1` the live site is left with: it promotes those
 * elements to their own compositing layer, and Chromium then paints their text
 * with grayscale antialiasing instead of subpixel AA. Without it the ported
 * pages look subtly different wherever text sits over a photo (the parity gate
 * catches exactly that, ~0.15% of the home page).
 *
 * `getSSRProps` is what keeps SSR happy: without it Vue throws
 * "Cannot read properties of undefined (reading 'getSSRProps')" while
 * server-rendering any element carrying the directive.
 */
const noopMotionDirective = {
  getSSRProps: () => ({}),
  mounted: (el: HTMLElement) => {
    el.style.transform = 'translateZ(0)'
    el.style.opacity = '1'
  },
  updated: () => {},
  unmounted: () => {}
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('motion', noopMotionDirective)
})
