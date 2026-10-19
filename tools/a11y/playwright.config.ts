import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const rawBaseUrl = process.env.A11Y_BASE_URL?.trim()
const BASE_URL = (rawBaseUrl || 'http://localhost:3000').replace(/\/+$/, '')
const HAS_BUILD = existsSync('../../.output/server/index.mjs')

/**
 * Portal accessibility gate (BC-13, WCAG 2.2 AA).
 *
 *   A11Y_BASE_URL  – the running app (default http://localhost:3000). In CI the
 *                    workflow builds Nuxt and points this at the preview server.
 *   A11Y_EMAIL /
 *   A11Y_PASSWORD  – a seeded staff/super-admin account. When both are present,
 *                    `global-setup.ts` signs in once and the authenticated portal
 *                    routes are scanned. When absent those routes are skipped
 *                    with a notice; the unauthenticated auth screens still run.
 *   A11Y_REQUIRE_AUTH=1 – fail instead of skipping when the credentials are
 *                    missing (use on a machine that is supposed to have them).
 *
 * The frozen public website is deliberately NOT in this suite: it is governed
 * by docs/PUBLIC-SITE-FREEZE.md and tools/public-parity (28/28).
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.a11y\.ts$/,
  timeout: 90_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'report' }]
  ],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure'
  },
  globalSetup: './global-setup.ts',
  webServer: rawBaseUrl
    ? undefined
    : {
        // CI builds first and lets Playwright own the preview process; local
        // runs without a build fall back to `nuxt dev`.
        command: HAS_BUILD ? 'node ../../.output/server/index.mjs' : 'npm --prefix ../.. run dev',
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 180_000
      },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ]
})
