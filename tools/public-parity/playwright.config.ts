import { defineConfig, devices } from '@playwright/test'

/**
 * Public-site parity gate.
 *   BASELINE_URL  – the current live site (default https://usc.syntaxure.dev, built from `main`)
 *   CANDIDATE_URL – the build under test (Vercel preview of develop/feature branch, or http://localhost:3000)
 *   VERCEL_BYPASS – optional "Protection Bypass for Automation" secret for protected Vercel previews
 *   MAX_DIFF      – allowed fraction of differing pixels per page (default 0.0005 = 0.05%)
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.pw\.ts$/,
  timeout: 120_000,
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'test-results',
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
