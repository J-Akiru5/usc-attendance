// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@nuxtjs/supabase'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Supabase auth: cookie-based SSR session. Falls back to the env names the
  // current app already uses on Vercel (SUPABASE_URL / SUPABASE_ANON_KEY),
  // with NUXT_PUBLIC_* taking precedence when set (runtime override, no rebuild).
  supabase: {
    url: process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    key: process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '',
    redirect: true,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      // Public site pages (ported in P1) go here — everything else requires a session.
      exclude: ['/login', '/confirm', '/reset-password']
    }
  }
})
