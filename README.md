# USC Attendance System

Geolocation-gated attendance tracking for University Student Council officers.

Built for the **University Student Council — ISUFST Dingle Campus**.

## What it does

One job: let an officer prove they physically showed up to an event, and let staff override that when the scanner can't be trusted or used.

- **Self check-in** via browser geolocation — officers tap "Check in now" when within range
- **Manual override** — staff can check in officers who can't use the scanner
- **Offline queue** — check-ins are stored locally and synced when the connection returns
- **PWA** — installable on mobile home screens, works offline

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vue 3 + Vite + TypeScript |
| UI | Tailwind CSS |
| State | Pinia |
| PWA | vite-plugin-pwa (Workbox) |
| Offline queue | idb (IndexedDB) |
| ORM | Prisma |
| Database / Auth | Supabase (PostgreSQL + Auth) |
| API | Vercel Serverless Functions |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
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
- `SUPABASE_ANON_KEY` — public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to client
- `DATABASE_URL` — session pooler connection string (port 5432)

### 3. Run database migration

```bash
npx prisma migrate dev
```

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
npm run dev:full
```

This runs `vercel dev`, which:
- Proxies the Vite frontend dev server (HMR, Tailwind, etc.)
- Executes `api/` serverless functions locally (auth, events, attendance)
- Reads `.env` for Supabase credentials — mirrors production exactly

For frontend-only work (styles, markup, components) where you don't need the API:

```bash
npm run dev
```

## Roles

| Role | Can do |
|------|--------|
| `super_admin` | Everything — manage events, override check-ins, view attendance |
| `staff` | Create events, manual override check-ins, view/export attendance |
| `client` | Self check-in only |

## Project Structure

```
├── api/                    # Vercel serverless functions
│   ├── _lib/               # Prisma, Supabase, auth middleware
│   ├── auth/               # Login endpoint
│   ├── events/             # Event CRUD
│   └── attendance/         # Check-in + CSV export
├── prisma/
│   └── schema.prisma       # Users, Events, Attendance tables
├── src/
│   ├── components/         # UI components (Button, Card, etc.)
│   ├── composables/        # useGeolocation, useOfflineQueue
│   ├── pages/              # Login, Dashboard, Events, CheckIn, Attendance
│   ├── router/             # Vue Router with role guards
│   └── stores/             # Pinia stores (auth, events)
└── public/                 # Static assets (logo, favicon)
```

## Deployment

1. Push to GitHub
2. Import repo in [Vercel](https://vercel.com)
3. Set environment variables
4. Deploy

```bash
# Or deploy via CLI
npx vercel --prod
```

## Data Integrity

- Attendance is **append-only** — no edit/delete in v1. Corrections are new rows.
- `@@unique([eventId, userId])` on the Attendance table prevents duplicate check-ins.
- Server re-validates geolocation distance — never trust the client.
- RLS is disabled; all enforcement is at the API layer via Prisma + role checks.

## License

[MIT](LICENSE)
