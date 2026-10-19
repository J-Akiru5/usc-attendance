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

  // Legacy index.html head, ported as-is (public-site freeze): the font stack
  // must match or every public page's pixels drift.
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'University Student Council — ISUFST Dingle Campus',
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/logo-192.webp' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Source+Serif+4:wght@400;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap'
        }
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'theme-color', content: '#142850' },
        { name: 'title', content: 'University Student Council — ISUFST Dingle Campus' },
        {
          name: 'description',
          content: 'Official website of the ISUFST Dingle Campus University Student Council. Explore events, campus guide, officer information, and the digital attendance portal.'
        }
      ]
    }
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
      // Public site (frozen pages ported in P1b) — everything else requires a session.
      exclude: [
        '/login',
        '/register',
        '/confirm',
        '/reset-password',
        '/',
        '/about',
        '/officers',
        '/projects',
        '/events',
        '/events/pag-abi-abi/photobooth',
        '/campus-guide',
        '/contact',
        '/privacy',
        '/portal',
        '/portal/features',
        '/portal/how-it-works',
        '/portal/security',
        '/portal/faq',
        // Public transparency board (plan §8.7) — a new route; the frozen
        // public pages above are untouched.
        '/transparency'
      ]
    }
  }
})
