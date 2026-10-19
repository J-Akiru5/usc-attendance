import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

/** Where the signed-in browser state is written. Also read by `portal.a11y.ts`. */
export const AUTH_STATE = path.resolve(process.cwd(), 'playwright/.auth/staff.json')

const BASE_URL = (process.env.A11Y_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')

/**
 * Sign in once, then reuse the cookie jar for every authenticated route.
 *
 * This is intentionally a real sign-in against the seeded test account rather
 * than a hand-forged Supabase cookie: the portal's server middleware has to
 * accept it, and a forged cookie would only test a different code path.
 */
export default async function globalSetup() {
  const email = process.env.A11Y_EMAIL
  const password = process.env.A11Y_PASSWORD

  // Always leave a readable (possibly empty) state file behind: Playwright
  // creates the browser context from `storageState` before a test can skip, so
  // a missing file would fail the run instead of producing a clean skip.
  await mkdir(path.dirname(AUTH_STATE), { recursive: true })
  await rm(AUTH_STATE, { force: true })

  if (!email || !password) {
    if (process.env.A11Y_REQUIRE_AUTH === '1') {
      throw new Error(
        'A11Y_REQUIRE_AUTH=1 but A11Y_EMAIL / A11Y_PASSWORD are not set. '
        + 'Configure the seeded test account, or unset A11Y_REQUIRE_AUTH to scan only the signed-out screens.'
      )
    }
    await writeFile(AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }, null, 2))
    console.warn(
      '[a11y] A11Y_EMAIL / A11Y_PASSWORD not set — scanning the signed-out routes only. '
      + 'Set both to include /dashboard, /manage/events, /scan, /fines, /manage/fines, '
      + '/notifications, /check-in, /qr, /duty and /change-password.'
    )
    return
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()

    // Login redirects to the saved target or `/` (the public home), so wait for
    // any URL that is no longer the login screen.
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded')

    await mkdir(path.dirname(AUTH_STATE), { recursive: true })
    await page.context().storageState({ path: AUTH_STATE })
  } finally {
    await browser.close()
  }
}
