# Cutover — the Nuxt app takes over `usc.syntaxure.dev`

> P1's exit step. Read alongside [PROFESSIONAL-SYSTEM-PLAN.md](PROFESSIONAL-SYSTEM-PLAN.md) §9 and
> [PUBLIC-SITE-FREEZE.md](PUBLIC-SITE-FREEZE.md). Nothing here changes the public site's content — it only changes
> *which build* serves it, from the same database.

## 1. Pre-flight (must all be green; anything red stops the cutover)

| # | Check | Command / where | Last known result |
|---|---|---|---|
| 1 | Parity gate, 28/28, live vs a production build of `develop` | `cd tools/public-parity && CANDIDATE_URL=<preview or http://localhost:3000> npx playwright test` | ✅ 28/28 (2026-10-18, local build) |
| 2 | Live e2e suites | `npm run test:e2e` | ✅ 191 checks |
| 3 | Unit tests | `npx vitest run` | ✅ 148 |
| 4 | Gate: lint · typecheck · legacy typecheck · build | `npx eslint .` · `npm run typecheck` · `npm run typecheck:legacy` · `npm run build` | ✅ |
| 5 | `develop` preview serves the app | Vercel preview: `/api/health` → `200 {"status":"ok","database":"up"}`, `/api/attendance` → `401`, unmatched `/api/*` → the legacy JSON 404, a public page renders | ✅ on the previous preview (re-verify on the latest after the deployment rate limit resets) |

## 2. Accounts and configuration (owner: Jeff)

- [ ] **Rotate the `admin@usc.edu.ph` password** (plan §14 — it still uses the development password).
- [ ] **Supabase → Auth → URL configuration:** redirect allow-list includes `https://usc.syntaxure.dev/reset-password`
      (and the site URL is `https://usc.syntaxure.dev`), so password resets and verification links come back to production.
- [ ] **Vercel → Environment Variables (Production):** `DATABASE_URL` = the Supabase **pooler** string, `DIRECT_URL`,
      `SUPABASE_URL` / `SUPABASE_ANON_KEY` (or `NUXT_PUBLIC_*`), `SUPABASE_SERVICE_ROLE_KEY`, `QR_SECRET`, `CRON_SECRET`,
      `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_URL` = `NUXT_PUBLIC_SITE_URL` = `https://usc.syntaxure.dev`.
- [ ] Optional, same screen: `SIGNATURE_STORAGE=r2` (the `R2_*` values are already there for photo uploads) and
      `RESEND_DAILY_LIMIT` if the free-plan ceiling moves.
- [ ] **Crons:** the purge runs from `vercel.json` (daily, Hobby allows two). The other three run from **GitHub Actions**
      (`.github/workflows/cron-*.yml`) because Hobby rejects sub-daily schedules *at deploy time* — an hourly entry there
      fails the deployment outright:
      - `cron-reminders.yml` — hourly, the 24 h and 1 h reminders
      - `cron-announcements.yml` — every 15 minutes, scheduled announcements
      - `cron-fines.yml` — daily 19:00, fines for events whose window has closed
      All four share `CRON_SECRET`, and each is idempotent, so a missed or repeated run is harmless. Two repository
      settings are needed for the workflows: a **secret** `CRON_SECRET` and, until the project moves to Pro/its own
      domain, a **variable** `SITE_URL` pointing at the deployment. Trigger each manually once (`workflow_dispatch`)
      and confirm a 200 — and when the project moves to Pro, the three can move back into `vercel.json` unchanged.
- [ ] Adviser / Co-Adviser accounts once their school emails arrive (§12.2 Q12), with the Settings capability.
- [ ] Semesters entered in Settings → Semesters for the current school year.

## 3. Cutover steps

1. **Safety net:** the last Vite production build stays tagged `pre-nuxt` (kept for rollback) — confirm the tag exists
   and that the previous production deployment is still listed in Vercel's Deployments tab.
2. **Last parity run:** run the gate once more against the *current* live site (baseline) and the latest `develop`
   preview (candidate). This is the last moment that comparison is possible; it must be 28/28.
3. **Merge `develop` → `main`** (the cutover PR carries no feature work — only what has already been reviewed into
   `develop`).
4. **Vercel → Project → Settings → Build & Development Settings:** framework preset **Nuxt** (root directory
   unchanged, production branch `main`), so the production build emits the Nitro output rather than the Vite app.
5. **Watch the production deployment** build from `main`; it uses the same database, so no data step is involved.

## 4. Post-deploy verification (first hour)

- `https://usc.syntaxure.dev/api/health` → `200 {"status":"ok","database":"up"}`.
- Home page, `/about`, `/officers`, `/events`, `/campus-guide`, `/contact`, `/privacy`, `/portal` load and look right on
  desktop and phone.
- Log in as an officer: dashboard renders, an event's roster opens, an export downloads (CSV + PDF).
- Open a student's QR page (`/qr`) and scan it with `/scan` — the 30-second rotation works.
- Vercel → Cron Jobs shows all four jobs (purge, reminders, announcements, fines); trigger each manually once and confirm a 200.
- Settings → Email quota card shows today's count/limit.

## 5. Rollback (any time, minutes)

1. Vercel → Deployments → the last production deployment from the previous `main` → **Promote to Production**
   (or redeploy the `pre-nuxt` tag/build). The database is unchanged in both directions — migrations in this rebuild
   were additive only.
2. The public site returns to the Vite build exactly as it was; the Nuxt app remains available on its preview URL.

## 6. Known follow-ups after the cutover

- The public copy on `/portal/features` and `/portal/security` still says QR tokens expire in "60 seconds"; the server
  rotates them every 30 (P1d). Correcting that copy is a public-site change: approve it and the baseline updates with it.
- `.font-serif` renders Inter on the public site because the previous build emitted an unquoted family name that
  browsers drop; restoring real serif type is likewise a public-site change needing approval.
- The uptime monitor (UptimeRobot or similar) should point at `https://usc.syntaxure.dev/api/health`.
