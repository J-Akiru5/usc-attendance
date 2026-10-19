import { test, expect, type BrowserContext, type Page } from '@playwright/test'

/**
 * BC-6 golden path. This is deliberately an end-to-end UI test, not a unit
 * test: the thing under test is that the same IndexedDB queue is visible after
 * a full reload and disappears only after a successful sync.
 *
 * Auth and the API are mocked (see README), so no database, officer account,
 * camera or network is involved. The queue is filled through the real manual
 * fallback on /scan: its POST is aborted, which the app treats as "no signal".
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? 'http://localhost:54321'
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME
  ?? `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

const OFFICER_ID = '2f1c8a8f-0f5e-4f1e-9c1d-6a0c2f7b1d11'
const STUDENT_ID = '6d2b7f8e-3b7a-4c1a-8f2e-9a4c1d2b3e44'
const EVENT_ID = 'event-durability'
const STUDENT_NO = '2024-00123'

const OFFICER = {
  id: OFFICER_ID,
  email: 'officer@example.invalid',
  name: 'Durability Officer',
  position: 'Test Officer',
  role: 'staff',
  canDelegate: false,
  canConfigure: false,
  mustChangePassword: false,
  capabilities: [],
  createdAt: '2026-01-01T00:00:00.000Z'
}

const EVENT = {
  id: EVENT_ID,
  title: 'Durability assembly',
  date: new Date(Date.now() + 86_400_000).toISOString(),
  lat: 10.72,
  lng: 122.56,
  radiusMeters: 200,
  createdBy: OFFICER_ID,
  createdAt: '2026-01-01T00:00:00.000Z'
}

const LOOKUP = {
  query: STUDENT_NO,
  exact: STUDENT_ID,
  students: [{
    id: STUDENT_ID,
    name: 'Durability Student',
    studentNo: STUDENT_NO,
    yearLevel: 2,
    section: 'BSIT 2-A'
  }]
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

/**
 * A structurally valid Supabase session cookie. `@supabase/ssr` stores the
 * session as `base64-<base64url JSON>` and the server-side redirect only reads
 * it; no Supabase call is needed to enter /scan. API calls are mocked below.
 */
function sessionCookie(now = Math.floor(Date.now() / 1000)): string {
  const user = {
    id: OFFICER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: OFFICER.email,
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z'
  }
  const token = [
    base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    base64Url(JSON.stringify({
      sub: OFFICER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: OFFICER.email,
      iat: now,
      exp: now + 8 * 60 * 60
    })),
    'scanner-durability'
  ].join('.')

  return 'base64-' + base64Url(JSON.stringify({
    access_token: token,
    token_type: 'bearer',
    expires_in: 8 * 60 * 60,
    expires_at: now + 8 * 60 * 60,
    refresh_token: 'scanner-durability-refresh',
    user
  }))
}

async function signIn(context: BrowserContext, baseURL: string): Promise<void> {
  const value = sessionCookie()
  // The configured name wins; the fallbacks make the spec resilient to a
  // preview that names its session differently. Extra cookies are ignored.
  const names = [...new Set([
    AUTH_COOKIE_NAME,
    `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`,
    'sb-auth-token'
  ])]

  await context.addCookies(names.map(name => ({
    name,
    value,
    url: baseURL,
    httpOnly: false,
    sameSite: 'Lax' as const
  })))
}

async function queueOneScan(page: Page, expected: number): Promise<void> {
  // BC-5: the manual fallback refuses a check-in without a reason, so the
  // golden path records one - which is the rule the officer now has to follow.
  await page.locator('#scan-reason').fill('phone dead')
  await page.getByPlaceholder('2024-00123 or a name').fill(STUDENT_NO)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await expect(page.getByTestId('scan-unsynced-banner')).toContainText(`${expected} unsynced scan`)
}

async function pendingInIndexedDb(page: Page): Promise<number> {
  return page.evaluate(async () => {
    return await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('usc-scanner-queue')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const count = db.transaction('pending', 'readonly').objectStore('pending').count()
        count.onsuccess = () => {
          resolve(count.result)
          db.close()
        }
        count.onerror = () => reject(count.error)
      }
    })
  })
}

test('queue offline → reload keeps the banner count → sync clears it', async ({ page, context, baseURL }) => {
  // The dashboard banner installs a beforeunload guard on purpose while scans
  // are queued; accept it so the reload under test is a real reload rather
  // than a cancelled navigation.
  page.on('dialog', async (dialog) => {
    await dialog.accept()
  })

  await signIn(context, baseURL!)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 10.72, longitude: 122.56 })

  let apiOnline = false

  await page.route('**/api/auth/me', route => route.fulfill({ json: OFFICER }))
  await page.route('**/api/events', route => route.fulfill({ json: [EVENT] }))
  await page.route(/\/api\/events\/[^/]+\/student-lookup\?/, route => route.fulfill({ json: LOOKUP }))
  // Layout chrome polls these; keep the test hermetic instead of letting the
  // unmocked routes reach a server that cannot verify the fake session.
  await page.route(/\/api\/notifications\?/, route => route.fulfill({ json: { unread: 0 } }))
  await page.route('**/api/attendance/pending-signature', route => route.fulfill({ json: [] }))
  await page.route('**/api/attendance', (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    if (!apiOnline) return route.abort('failed')
    return route.fulfill({ status: 201, json: { user: { name: 'Durability Student' } } })
  })

  await page.goto(`/scan?eventId=${EVENT_ID}`)
  await expect(page.getByRole('heading', { name: 'Scan a student QR or ID' })).toBeVisible()

  // Two scans taken with no signal: the POST never reaches the server, so the
  // real scanner path writes both to IndexedDB and parks them in the banner.
  await queueOneScan(page, 1)
  await queueOneScan(page, 2)
  await expect(page.locator('#queue')).toContainText('2')
  expect(await pendingInIndexedDb(page)).toBe(2)

  // A full reload is the durability moment: the queue and the banner's count
  // must both come back from IndexedDB, not from component memory.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Scan a student QR or ID' })).toBeVisible()
  await expect(page.getByTestId('scan-unsynced-banner')).toContainText('2 unsynced scans')

  // The page auto-flushes on mount; the API is still down, so after that
  // attempt the count must be unchanged rather than zero or doubled.
  await page.waitForTimeout(700)
  await expect(page.getByTestId('scan-unsynced-banner')).toContainText('2 unsynced scans')
  expect(await pendingInIndexedDb(page)).toBe(2)

  // The connection returns: one sync empties the queue and the banner clears.
  apiOnline = true
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled()
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByTestId('scan-unsynced-banner')).toHaveCount(0)
  await expect(page.locator('#queue')).toHaveCount(0)
  expect(await pendingInIndexedDb(page)).toBe(0)
})
