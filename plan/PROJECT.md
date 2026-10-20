---
id: P-0001
title: USC Attendance rebuild (Nuxt 4 + Nitro + Prisma)
---

# Intent

Rebuild the USC (University Student Council, ISUFST Dingle) attendance system from the legacy
Vite/Supabase app into a Nuxt 4 + Nuxt UI + Nitro + Prisma application, without changing the public
USC website, and without losing any historical attendance, signature, fine or clearance record.

**The plan of record is [`docs/PROFESSIONAL-SYSTEM-PLAN.md`](../docs/PROFESSIONAL-SYSTEM-PLAN.md)** —
scope, phased roadmap, module specifications, acceptance tests, the §12 decision register (D-01…D-08),
the §12.2 open questions and the §14 tracker. This file does not restate it; it records only what the
AgentOps layer needs.

# Invariants

- **Public site freeze.** The 14 public routes stay byte-identical; `docs/PUBLIC-SITE-FREEZE.md` and
  `tools/public-parity` (28/28) govern any change near them. New routes are additions, never edits.
- **Database migrations are additive only.** Applied by the integrator, one at a time.
- **Every permission is enforced server-side.** UI checks are cosmetic.
- **Never print or commit secrets, or real student data.** Tests use `@example.invalid` throwaway data
  with full cleanup.
- **One task, one worktree, one branch.** Integration into `develop` only through the repository
  workflow (pull request + CI) or `agentctl integrate`.

# Current state (2026-10-20)

- Phases P0, P1, P2 complete and merged. P3 complete except the official letterhead PDF (waiting on the
  university's document). P4 complete (fines, excuses, payments/clearance/verification) and P6 (finance)
  and P7 (documents) merged. P8 launch hardening is in progress.
- The decision register D-01…D-08 is **implemented and merged**; the six code deltas were verified live
  in a 22-suite / 598-check batch.
- Remaining: the benchmark's hardening amendments (see `plan/milestones/M-0001.md`), the public parity
  gate before cutover, and the console-side cutover items in `docs/CUTOVER.md`.

# Standing owner decisions (do not relitigate)

- Elections are **deferred** until the COMELEC says it is season.
- Monetary sanctions are for **officers only**, and only with a citation (D-01).
- Announcements are inbox-first; email is an explicit per-send opt-in (D-08).
- iOS officers do QR-only duty; barcode scanning is Chromium-only (D-03).
- A second officer on a shared phone is refused and the first officer queue is preserved (2026-10-20).
- The offline scan window stays at 48 hours; the student QR keeps its 30-second rotation (2026-10-20).
- A manual check-in carries a reason and a photo of the student ID, with a 90-day retention default (2026-10-20).
