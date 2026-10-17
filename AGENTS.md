# Agent guide

The master plan, decisions, roadmap and working agreement for this repo live in
**[docs/PROFESSIONAL-SYSTEM-PLAN.md](docs/PROFESSIONAL-SYSTEM-PLAN.md)**. Read it before changing code.

**Public site freeze:** the public USC website stays exactly as it is. Read
**[docs/PUBLIC-SITE-FREEZE.md](docs/PUBLIC-SITE-FREEZE.md)**: port public pages as-is (same markup, classes,
routes, CMS calls), keep the legacy colour names as theme aliases, and pass the parity gate
(`tools/public-parity`, 28/28) before any merge that touches public pages, layouts, global CSS or the theme.

Key rules (details in §13 of the plan):

- Work flows `feat/p<N>-<slug>` → PR into **`develop`** (reconcile after every phase); only the final cutover goes `develop` → `main`. Never merge rebuild work into `main` directly.
- Database migrations are additive only; never run `prisma migrate dev` or `reset`.
- Enforce every permission on the server; UI checks are cosmetic.
- Add unit tests and a live e2e script (throwaway `@example.invalid` data, full cleanup) for new endpoints.
- Never print secrets or real student data.
- Update the plan's progress tracker (§14) in the PR that completes an item.
