# USC Attendance System

Geolocation-gated attendance tracking for University Student Council officers.

Built for the **University Student Council — ISUFST Dingle Campus**.

> **Roadmap:** the plan for the professional USC platform (Nuxt 4 + Nuxt UI rebuild, events calendar, analytics, notifications, fines & clearance, elections, finance, documents) is in [docs/PROFESSIONAL-SYSTEM-PLAN.md](docs/PROFESSIONAL-SYSTEM-PLAN.md). Agents: see [AGENTS.md](AGENTS.md).

## What it does

One job: let an officer prove they physically showed up to an event, and let staff override that when the scanner can't be trusted or used.

- **Self check-in** via browser geolocation — officers tap "Check in now" when within range
- **Manual override** — staff can check in officers who can't use the scanner
- **Offline queue** — check-ins are stored locally and synced when the connection returns
- **PWA** — installable on mobile home screens, works offline

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Nuxt 4 (Vue 3) + TypeScript |
| UI | Nuxt UI v4 (Tailwind CSS 4) |
| Server | Nitro routes (`server/api/`) + ported logic (`server/utils/`) |
| Auth | `@nuxtjs/supabase` (cookie-based SSR sessions) |
| ORM | Prisma |
| Database / Auth | Supabase (PostgreSQL + Auth) |
| API | Same URLs as the legacy Vercel functions, served by Nitro (ported in P1a; the `api/` folder is gone) |
| Hosting | Vercel |

> The Nuxt rebuild runs on this branch behind its own preview URL (strangler pattern).
> The live site at `usc.syntaxure.dev` still serves the previous Vite app from `main`.

## Getting Started

### Prerequisites

- Node.js 24+
- A [Supabase](https://supabase.com) project (Singapore region recommended)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the example and fill in your Supabase credentials:

```bash
cp .env.example .env
```

You'll need:
- `SUPABASE_URL` — from your Supabase project settings
- `SUPABASE_ANON_KEY` — public anon key (the Nuxt auth module falls back to these two; `NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_KEY` can override at runtime without a rebuild)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to client
- `DATABASE_URL` — session pooler connection string (port 5432)

### 3. Run database migration

```bash
npx prisma migrate dev
```

Migrations are additive-only — see the working agreement in [AGENTS.md](AGENTS.md).

### 4. Seed test accounts

Login-capable accounts require **both** a Postgres row (`public.users`) and a Supabase Auth identity (`auth.users`) with matching IDs. Two separate scripts exist — you need the second one:

```bash
npm run db:auth-seed
```

This runs `prisma/seed_auth.ts`, which:
- Creates (or updates the password of) each officer's Supabase Auth account
- Syncs the Postgres `users` table row so the ID matches the Auth account
- Reads passwords from `prisma/seed_auth.ts` (officers) and the `SEED_ADMIN_PASSWORD` env var (admin)

| Script | What it does | Creates Auth accounts? |
|--------|-------------|----------------------|
| `npm run db:seed` | Inserts Postgres rows with random UUIDs | No |
| `npm run db:auth-seed` | Creates Supabase Auth users and syncs Postgres rows | Yes |

**Important:** `prisma migrate dev` (step 3) automatically runs `db:seed` — not `db:auth-seed` — as a side effect of Prisma's seed hook (`"prisma.seed"` in package.json). If you reset your database (e.g. `prisma migrate reset`), the Postgres rows get re-seeded with fresh random UUIDs that won't match any Auth account. Always run `npm run db:auth-seed` afterward to restore login-capable accounts.

### 5. Start development server

```bash
npm run dev
```

This runs the Nuxt dev server (app + Nitro API routes) with HMR.

### Other scripts

```bash
npm run lint              # ESLint
npm run typecheck         # nuxi typecheck (app + server)
npm run typecheck:legacy  # tsc over prisma/ scripts/ tests/ (pre-Nuxt code)
npm test                  # Vitest — unit tests in tests/
npm run test:e2e          # live e2e — boots nuxt dev + runs scripts/e2e/*.e2e.mts (113 checks)
npm run build             # production build (.output; .vercel/output on Vercel)
```

## Roles

| Role | Can do |
|------|--------|
| `super_admin` | Everything — manage events, override check-ins, view attendance |
| `staff` | Create events, manual override check-ins, view/export attendance |
| `client` | Self check-in only |

## Project Structure

```
├── app/                    # Nuxt app (public site + portal ported in P1)
│   ├── assets/css/         # Tailwind 4 theme — USC navy/gold tokens + v3 compat layer for the frozen public pages
│   ├── components/         # layout/ (portal shell) + ui/ (ported primitives) + portal panels
│   ├── composables/        # useEvents, usePageContent, useCampusGuide, useGeolocation, useOfflineQueue
│   ├── layouts/            # dashboard (portal shell) / public (frozen site) / auth
│   ├── middleware/         # auth.global.ts — ported router guards
│   ├── pages/              # public site + portal + auth pages
│   └── stores/             # useState-backed stores (auth, events, duties, schedules, delegations)
├── server/                 # Nitro API — same URLs as the old Vercel functions
│   ├── api/                # one file per route (attendance, auth, cms, delegations, …)
│   └── utils/              # prisma, auth, http + ported qr/signature/report/… logic
├── tests/                  # Vitest unit tests (ported from api/_lib/*.test.ts)
├── prisma/
│   ├── schema.prisma       # Users, Events, Attendance tables
│   ├── migrations/         # additive-only SQL migrations
│   └── seed_auth.ts        # Supabase Auth + Postgres sync seeder
├── scripts/
│   └── e2e/                # live e2e checks — npm run test:e2e (throwaway data, full cleanup)
└── public/                 # Static assets (logo, favicon, officers, data)
```

## Deployment

Push to `main` deploys the live Vite app. Branches get preview deployments on
[Vercel](https://vercel.com) — the Nuxt branch previews at its own URL until the
P1 cutover switches the project's framework preset to Nuxt.

```bash
# Deploy via CLI (preview)
npx vercel
```

## Data Integrity

- Attendance is **append-only** — no edit/delete in v1. Corrections are new rows.
- `@@unique([eventId, userId])` on the Attendance table prevents duplicate check-ins.
- Server re-validates geolocation distance — never trust the client.
- RLS is disabled; all enforcement is at the API layer via Prisma + role checks.

## License

[MIT](LICENSE)
