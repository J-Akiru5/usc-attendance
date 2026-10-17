// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'
import { getDefaultAttributes } from 'eslint-plugin-better-tailwindcss/api/defaults'

export default withNuxt(
  {
    rules: {
      'vue/no-multiple-template-root': 'off',
      'vue/max-attributes-per-line': ['error', { singleline: 3 }]
    }
  },
  {
    // Live e2e / seed scripts are dense one-liner utilities, not app code.
    files: ['scripts/**', 'prisma/**'],
    rules: {
      '@stylistic/max-statements-per-line': 'off',
      '@stylistic/max-statements': 'off',
      '@stylistic/multiline-comment-style': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-useless-assignment': 'off'
    }
  },
  betterTailwindcss.configs['correctness-error'],
  {
    // Ported verbatim from the frozen public site (docs/PUBLIC-SITE-FREEZE.md):
    // these files use custom classes defined in their own <style> blocks (org
    // chart, footer, watermark) and the inert `xs:` variant the live Tailwind
    // v3 build also ignores. The Tailwind class lint cannot resolve those, and
    // the markup must stay byte-identical to live, so the unknown-class check
    // is skipped for exactly these files. (Must come after the plugin preset,
    // which sets the rule to "error".)
    files: [
      'app/layouts/public.vue',
      'app/components/ui/EventsCarousel.vue',
      'app/components/ui/FlagCeremonySection.vue',
      'app/components/ui/VideoPlayer.vue',
      'app/components/ui/OrgChart.vue',
      'app/components/ui/OfficerCard.vue',
      'app/pages/index.vue',
      'app/pages/about.vue',
      'app/pages/officers.vue',
      'app/pages/projects.vue',
      'app/pages/campus-guide.vue',
      'app/pages/contact.vue',
      'app/pages/privacy.vue',
      'app/pages/events/index.vue',
      'app/pages/events/pag-abi-abi/photobooth.vue',
      'app/pages/portal/index.vue',
      'app/pages/portal/features.vue',
      'app/pages/portal/how-it-works.vue',
      'app/pages/portal/security.vue',
      'app/pages/portal/faq.vue'
    ],
    rules: {
      'better-tailwindcss/no-unknown-classes': 'off'
    }
  },
  {
    settings: {
      'better-tailwindcss': {
        entryPoint: 'app/assets/css/main.css',
        attributes: [
          ...getDefaultAttributes(),
          ['^v-bind:ui$', [{ match: 'objectValues' }]]
        ]
      }
    }
  }
)
