import { defineConfig, devices } from '@playwright/test'

/**
 * Offline-queue durability guard (BC-6).
 *
 * By default this starts the Nuxt app on port 3100 with a dummy Supabase
 * project. Auth is faked in the spec (an injected session cookie + mocked
 * `/api/**` routes), so the run needs no database, no officer account and no
 * camera. Set `APP_URL` to point at an already-running app instead.
 */
const APP_URL = (process.env.APP_URL ?? 'http://127.0.0.1:3100').replace(/\/+$/, '')
/**
 * Deliberately not the app's real Supabase project: the spec injects a fake
 * session and mocks every API call, so the server must never be able to reach
 * a real project (or need real keys). Point `APP_URL` at a preview and set
 * `TEST_SUPABASE_URL` (or `AUTH_COOKIE_NAME`) if that preview names its cookie
 * differently.
 */
const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? 'http://localhost:54321'
const SUPABASE_KEY = 'scanner-durability-test-key'

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.pw\.ts$/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'test-results',
  use: {
    ...devices['Pixel 7'],
    baseURL: APP_URL,
    trace: 'retain-on-failure'
  },
  webServer: process.env.APP_URL
    ? undefined
    : {
        // Locally the dev server is convenient; in CI it is not. A cold Nuxt
        // dev start never became reachable inside the readiness budget on a
        // two-core runner (three attempts, 120 s then 300 s), so CI builds
        // first (.github/workflows/scanner-durability.yml) and this serves the
        // built output, which answers in seconds.
        command: process.env.CI ? 'node .output/server/index.mjs' : 'npm run dev -- --port 3100',
        cwd: '../..',
        url: `${APP_URL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          NITRO_PORT: '3100',
          NITRO_HOST: '127.0.0.1',
          NUXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
          NUXT_PUBLIC_SUPABASE_KEY: SUPABASE_KEY
        }
      }
})
