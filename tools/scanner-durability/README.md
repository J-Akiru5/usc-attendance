# Scanner durability — golden path (BC-6)

Guards the one promise that makes the offline scanner trustworthy: **a queued scan survives a page reload, and the "N unsynced" count is the same after that reload**. It then proves the count clears only after a successful sync.

This is the BC-6 acceptance test from `docs/BENCHMARK-REVIEW.md`; the pure decisions behind it (cap, banner, refusal acknowledgement, storage nudge) are unit-tested in `tests/unit/scan-queue.test.ts`.

## What it does

One Chromium test, under two minutes:

1. Opens `/scan` as a staff officer with a mocked API and a fake Supabase session cookie.
2. Queues **two** scans through the real manual fallback while every `POST /api/attendance` is aborted — the app's genuine "no signal" path.
3. Asserts the dashboard banner says **2 unsynced scans** and IndexedDB holds two rows.
4. **Reloads the page.** The queue must come back from IndexedDB; the auto-sync attempt fails again, and the banner must still say **2 unsynced scans** (not 0, not 4).
5. Lets the API succeed, taps **Sync now**, and asserts the banner and queue card disappear and IndexedDB is empty.

The `beforeunload` guard is intentionally installed by the dashboard banner while scans are queued (so it covers every officer page). The spec accepts that dialog so the reload is a real navigation; a cancelled reload would fail the count assertion.

## What is mocked, and why

No database, no Supabase project, no officer account and no camera are needed:

- `context.addCookies` injects a structurally valid `@supabase/ssr` session (`base64-…` JSON) so the server-side auth redirect lets the test reach `/scan`. The app never verifies the fake token against Supabase.
- Page routes mock `/api/auth/me`, `/api/events`, the student lookup, and `POST /api/attendance`. The attendance route is aborted until the sync step.
- Camera access is allowed to fail; the manual fallback is the queue path under test.

This is a UI durability test. The real server rules for offline scans (token lifetime, geofence, delegation, 48 h bound) stay covered by `scripts/e2e/offline.e2e.mts`, which needs the live stack.

## Run it

```bash
cd tools/scanner-durability
npm ci
npx playwright install chromium        # once per machine
npm test
```

By default Playwright starts the Nuxt app on **http://localhost:3100** with a dummy Supabase URL/key (`NUXT_PUBLIC_SUPABASE_URL=http://localhost:54321`), so nothing outside the repo is contacted by the app.

To point at an already-running app instead:

```bash
APP_URL=https://your-preview.example npm test
```

If that app's Supabase project is not the dummy localhost one, pass `TEST_SUPABASE_URL=https://<project-ref>.supabase.co` (or `AUTH_COOKIE_NAME` directly) so the injected cookie matches its `sb-<project-ref>-auth-token` name.

## CI

The job needs the repository's normal dependencies plus this folder's Playwright dependency:

```bash
npm ci
cd tools/scanner-durability && npm ci && npx playwright install --with-deps chromium
npm test
```

No secrets or database URL are required: the spec mocks both auth and the API. Keep it at one worker so the IndexedDB assertions are deterministic. The test timeout is 90 s and the single test normally finishes in well under a minute once the dev server is warm.

## Limits

- It does not test a real `navigator.storage.persist()` grant/refusal; browsers decide that outside Playwright's control. The UI decision is unit-tested from `{ persisted, quota, usage }`.
- It does not replace `scripts/e2e/offline.e2e.mts`; it protects the client-side durability contract specifically.
