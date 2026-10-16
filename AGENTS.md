# Agent guide

The master plan, decisions, roadmap and working agreement for this repo live in
**[docs/PROFESSIONAL-SYSTEM-PLAN.md](docs/PROFESSIONAL-SYSTEM-PLAN.md)**. Read it before changing code.

Key rules (details in §13 of the plan):

- Never commit to `main`; branch `feat/p<N>-<slug>` and open a PR.
- Database migrations are additive only; never run `prisma migrate dev` or `reset`.
- Enforce every permission on the server; UI checks are cosmetic.
- Add unit tests and a live e2e script (throwaway `@example.invalid` data, full cleanup) for new endpoints.
- Never print secrets or real student data.
- Update the plan's progress tracker (§14) in the PR that completes an item.
