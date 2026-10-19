# Benchmark review — the USC platform vs the industry, and amendments to the plan

> **Status:** Research report v1 · 2026-10-19 · Author: benchmark researcher (subagent) · Owner: Jeff
> **Scope:** benchmark the built system against commercial campus platforms, Philippine law and operating practice, then propose
> **patch-ready amendments**. This file does **not** edit [PROFESSIONAL-SYSTEM-PLAN.md](PROFESSIONAL-SYSTEM-PLAN.md); the integrator applies the changes from §4.
>
> **What was checked:** the plan in full (§1–§16), `AGENTS.md`, `git log` (P0→P4b landed: events/categories/calendar, registration + FIFO waitlist, recurring instances, ID-barcode scanning, offline queue with scan-time validation, analytics + Student 360, notification core, announcements, fines, excuses), `prisma/schema.prisma`, `server/api/**`, `server/utils/*`, `vercel.json`, `package.json`, and the P4c payments / P6 finance / P7 documents branches that are in flight (all three worktrees sit at `1f95c09` with no commits yet).
>
> **Evidence grades used below:** `[law]` statute / NPC issuance · `[vendor]` vendor documentation (indicative) · `[code]` verified in this repo · `[practice]` documented institutional practice · `[tech]` platform documentation.
>
> **Nothing here was built, installed, migrated or deployed.** Research and writing only.

---

## TL;DR

**The engineering is ahead of the industry bar for a student council. The compliance and money-handling layers are behind it, and one hosting decision in the plan is not implementable as written.**

### Verdict by module

| Module | vs CampusGroups / Engage | The one thing that matters most |
|---|---|---|
| Attendance core | **Ahead** — e-signature, delegation, self/QR/barcode/manual methods, check-out | Officer accountability reporting (who records what, how) — the fraud surface is the officer, not the student |
| Events & calendar | **At par** | Nothing blocking; freeze the expected roster for reproducibility |
| Registration & waitlist | **At par** (FIFO + auto-promote) | No offer/claim window; capacity changes are unhandled |
| Scanning & offline | **Ahead** on scan-time validation; **behind** on durability | IndexedDB queue is best-effort storage and can be evicted; no idempotency key |
| Analytics | **At par** on features; **behind** on auditability | Numbers recompute live from today's data — a signed report can't be reproduced |
| Notifications | **Behind** | Vercel Hobby cannot run the hourly/15-min crons the plan needs; three built crons are not scheduled at all `[code]` |
| Fines & clearance | **Ahead** on rules/centavos/idempotency; **behind** on money controls | Money is collected with no OR register, no reconciliation, no segregation of duties |
| Finance & liquidation | Not built yet — **build the controls, not just the workflow** | Encumbrance (committed-but-unpaid), fund accounting, and two-signature approval |
| Documents | Not built yet | Classification + redaction + immutable versions + a real retention schedule |

### The five amendments that carry the most weight

1. **BC-1 — Record consent, and version the notice.** `[law]` NPC Circular 2023-04 requires that consent be *demonstrable* (the information given + the timing + the act). The plan asserts "consent at registration (done)" but `prisma/schema.prisma` has no consent column anywhere `[code]`. This is the only gap that gets **harder every day the system runs**: you cannot obtain consent retroactively for data already collected, and everything downstream (attendance = information about education = **sensitive personal information**, fines, geolocation, ID scans, signatures) leans on it.
2. **BC-3 — Fix the cron story before cutover.** `[tech]` Vercel Hobby is **limited to one cron run per day** and *cron expressions that run more often fail at deployment* (Vercel's own docs). The plan's §11.1 already says "daily crons only" but §8.4 and the built endpoints assume hourly and every-15-minutes sweeps (`CUTOVER.md` lists `0 * * * *` and `*/15 * * * *`) `[code]`. Worse, `vercel.json` currently schedules **only** `/api/cron/purge-signatures` — scheduled announcements, reminders and fines generation **never fire automatically today** `[code]`.
3. **BC-4 — Freeze the expected roster and the fine policy when the check-in window closes.** Today "expected" is computed live from the audience resolver, so a report run in October and the fine generated that night can disagree, and a student who transfers college after the event can be charged or missed. One snapshot row per event fixes report reproducibility, fine fairness and the eventual liquidation reconciliation.
4. **BC-5 — Make attendance idempotent and duplicate-proof at the database.** No unique constraint exists on `(eventId, userId)` and no idempotency key exists for queued scans `[code]`, so two officers scanning the same student at the same door race on an app-level check, and a retry after a lost response lands as a "refusal" in the parked list. An audit trail over attendance that can contain a silent duplicate is not an audit trail.
5. **BC-7 — Put the money controls in the same PR as the payment recording.** The council is about to collect cash with the *highest-risk* flow in the system (Treasurer + cash + a student who owes) and the *lowest* control density: no OR register, no daily collection report, no physical-cash reconciliation, no reversal path, and — per §7.2 — "record payment" goes to the Treasurer and the super admin with no separate verify or audit step. Related and confirmed in the schema: **the portal `Event` model has no cancellation status**, so a cancelled event that has passed is still an event whose window closed, and the nightly fine cron will charge its entire required audience `[code]`.

### Highlights from where I believe the plan is wrong (§6)

- **"Consent at registration (done)" is not true** and it is load-bearing for the whole §11.2 section.
- **DPA artefacts are scheduled for P8 (launch) but the pilot event happens before that** — the pilot creates the real data the paperwork is supposed to govern. Move the *artefacts* earlier; keep the *filing* at P8.
- **The geofence gets the research attention while the actual fraud surface is officer-recorded entries.** A web app cannot detect a mock GPS provider (there is no browser API for it), so client-side anti-spoofing is a dead end; per-officer record-mix reporting and manual-entry reasons are the cheap, real control.

### Needs the owner's decision (§7)

The **legal basis for monetary fines** (RA 4206 as amended by RA 5546 prohibits collecting contributions from students "in any form whatsoever" `[law]`), **who the Personal Information Controller is** for this platform (the university or the council) and therefore who registers the data-processing system with the NPC, and **whether the platform may ever gate a university credential** (my position: no).

---

## 0. How to read this document

| Thing | Meaning |
|---|---|
| **BC-n** | Amendment **before cutover** — cheap now, expensive or impossible later, or required for lawful operation. |
| **NP-n** | Amendment **next phase** — belongs in the phase that owns the module. |
| **BL-n** | **Backlog** — worth doing, wrong time, or contingent on something else. |
| **W-n** | "Where the plan is wrong" — an opinion, stated plainly, with the reasoning. |
| **Q-n** | A decision the owner must make; written so it can be pasted into §12.2 of the plan. |
| Effort | `S` ≈ under a day · `M` ≈ 1–3 days · `L` ≈ a week or more, for one developer with agents. |

Everything in §4 is written to be applied by editing the plan — the target section is named, and the patch text is close to what should land in the document.

---

## 1. The benchmark set — what these platforms actually do

| Platform | Check-in / attendance | Money | Documents & governance | What is worth copying |
|---|---|---|---|---|
| **CampusGroups** (Ready Education) `[vendor]` | QR scanning, **student ID card swipe**, manual entry, and **dynamic self-check-in QR** a student scans at the door; the QR refreshes (the plan cites 30 s) | Budgeting tools; org websites | Learning pathways, org rosters | Multiple parallel check-in methods at one door; a check-in method mix that is reportable |
| **Anthology Engage** `[vendor]` | Card Swipe module + a dedicated **Event Check-In App** | **The reference model.** Accounts mapped to a **parent (general-ledger) account**; **funding / purchase / budget requests** as first-class forms with configurable extra fields; **finance stages** (approval workflow, max 5 stages); **transactions** (allocate · deposit · payment · transfer) separate from requests; **encumbered funds** = approved-but-unpaid, held against the balance; budgeted line items get a "request exceeds approved amount" warning | Document management per org; **elections**; SGA-specific guidance (budgets, transparency with member orgs) | Requests ≠ money movement. **Encumbrance.** Stage/workflow with per-stage reviewers. Request history with comment visibility |
| **Modern Campus Involve** (rebranded from **Presence**) `[vendor]` | In-app check-in with a **Digital ID**; staff can scan attendees in; a **PIN** path for staff-driven check-in; event check-in webinar series | Limited financial support (the plan's own note) | Engagement/assessment focus, co-curricular records | The PIN/manual check-in as a *designed* path, not a fallback; engagement as an outcome metric |
| **Greek-life finance** (OmegaFi and similar) `[vendor]` | — | Dues invoicing in bulk, payment plans, budget tracking, unlimited accounts; marketed on collections uplift | Member database, recruitment | **Invoices with terms and reminders**, not a balance on a page; payment plans; a collections view |
| **University org-finance policies** `[practice]` | — | **Two-signature rule** on accounts and on expenditures above a threshold (WVU: >$100 needs the account manager **and** the President); two authorized signatories on cheques; **monthly treasurer's report to leadership**; **regular independent audits** | — | Encode **two-person approval** and a **monthly report artefact** into the finance module, not into a policy PDF |
| **QR/geofence attendance tools** (per the plan's §2.2 research, plus platform docs) `[vendor]` `[practice]` | Layered: time-limited dynamic QR + duplicate checks + **device binding** + Haversine geofence | — | — | Device binding is the one layer we never built; but see W5 — in a **web** app it is a claim, not an attestation |

**Caveat, restated and extended:** Ready Education sells CampusGroups and its comparison material is marketing; Anthology's help centre is authoritative about *its* product but says nothing about whether the workflow is good for a Philippine SUC. The university-policy sources are the most transferable evidence here because they describe what an auditor would ask for.

---

## 2. The Philippine frame — the rules the plan has to satisfy

| Instrument | What it actually says | What it means for us | Lands in |
|---|---|---|---|
| **RA 10173 (DPA)** §3(l), §12, §13 `[law]` | "Information about an individual's education" is **sensitive personal information**, processing of which is *generally prohibited* unless a §13 ground applies — the practical one for a council is **§13(a) consent** or **§13(d) the lawful non-commercial objectives of public organisations and their associations, confined to bona fide members, no third-party transfer, consent obtained before processing** | Attendance, section/college/year, fines, clearance, signatures and ID scans are **all SPI**. The platform's lawful basis must be written down and consent captured — "the university requires attendance" is not, by itself, an instrument the council can lean on | §11.2, §8.1, BC-1 |
| **DPA IRR (2016)** `[law]` | Consent must be **time-bound** in relation to a declared, specified purpose; PIC obligations, registration rules | Purposes must be specific, not "for school purposes" | BC-1, BC-2 |
| **NPC Circular 2023-04 — Guidelines on Consent** `[law]` | Consent must be **demonstrable** — evidence of (a) the information presented, (b) that it was given at the time of consent, (c) the act signifying consent. **Consent must be granular** for unrelated purposes; **vague or blanket consent is prohibited**; a privacy notice is required *for every instance of processing*, usually as a **layered notice**; consent for optional processing must not be bundled as a condition of the service | We need a consent record (purpose, notice version, timestamp, method), and separate optional consents (publication of name/photo; marketing-style messages) from required ones (attendance, fines) | BC-1 |
| **Minors** — Education Sector Advisory No. 2020-1 `[law]` | In the case of minors, consent comes from the **parent or legal guardian** | The age of majority is 18 (RA 6809). Some first-year students are 17. Registration needs an "18 or over" gate with a guardian-consent path | BC-1 |
| **NPC Advisory Opinion 2020-046** `[law]` | A **class roster** — school, grade level, section, test scores — is SPI; posting it requires a §13 basis | Never publish or expose a roster, a no-show list, or a fine list outside the officers who need it. The analytics "no-show list" is officer-only, and the Student 360 is staff-or-self | §8.3, §11.2 |
| **NPC Advisory Opinion 2018-020** `[law]` | Posting **names** of successful applicants was allowed under legitimate interest, but the NPC *recommended obtaining consent* and warned about reasonable expectations | Public leaderboards ("most present"), public fine lists, public clearance details: all require consent or an aggregate-only treatment | §8.7, §8.8, BC-9 |
| **NPC Circular 2022-04 + IRR §46–47** `[law]` | **Mandatory registration** of data processing systems if the PIC employs ≥250 people, or processes SPI of **≥1,000 individuals**, or processing is **likely to pose a risk** (vulnerable subjects, or an imbalance between subject and controller). An entity outside those thresholds must file a **notarised sworn declaration** (Annex 1) if it does not register voluntarily. Register **within 20 days** of launching a new DPS. **One DPO per entity, with a position-based email** | The council must decide whether it is a PIC in its own right. If SPI of ≥1,000 students is processed (or the university registers, which most HEIs do), the platform should be **added to the university's registration as a DPS**; otherwise Annex 1. Either way this is a filing with a 20-day clock, not a P8 flourish | Q-2, BC-2 |
| **NPC Circular 16-03** `[law]` | Breach notification to the NPC and affected data subjects **within 72 hours** of knowledge, with a fuller report to follow (a 2026 clarification shortens the follow-up timeline) | A written breach runbook + a one-page incident template + an on-call contact list must exist **before** the pilot, because the clock starts at *knowledge* | BC-6 |
| **CHED CMO No. 09 s. 2013** (and the 2026 CMO superseding it in this space) `[law]` | Sets minimum standards for Student Affairs and Services, including student organisations and **Student Services Funds, which must be "judiciously disposed"** | The council's money handling is not a private hobby — the university has a supervisory interest, which is also why the adviser is on every approval step | §8.7, NP-1, Q-3 |
| **RA 4206, as amended by RA 5546** `[law]` | "The sale of tickets and/or the **collection of contributions in any form whatsoever, by any person for any project or purpose, whether voluntary or otherwise, from school children, students and teachers** of public and private schools, colleges and universities is hereby prohibited" — the only exceptions are Red Cross / Girl Scouts / Boy Scouts membership fees and parent donations to barrio high schools. Violation carries a fine and/or imprisonment, and for private schools loss of the permit to operate | **The monetary-fine design needs a documented authority.** A ₱50 sanction for absence is plausibly a "collection of contributions… in any form whatsoever… whether voluntary or otherwise… from students". This is a 1969 statute aimed at school fund-raising, interpretation is contested in practice, and the council's own charter plus the adviser's and the university's written approval is the minimum defensible footing. Design implication: **make the sanction type configurable** (warning · service · monetary) so the platform carries the policy rather than assuming it | Q-1, BC-7 |
| **RA 11984 — No Permit, No Exam Prohibition Act (2024)** `[law]` | Covers **basic and higher education** institutions; requires them to let **disadvantaged students** (certified by the MSWDO/DSWD) take exams without a permit; expressly **preserves the institution's power to withhold records and credentials for unpaid fees** | A student council is not the educational institution, and a council fine is not a school fee. The policy direction is unambiguous: **the platform must never be the mechanism that blocks enrollment, examinations or credentials.** Clearance is a record of standing, not a gate | BC-8, Q-4 |
| **RA 9470 + NAP General Records Disposition Schedule** `[law]` / `[practice]` | Government agencies may not dispose of or destroy public records without NAP authority; the NAP issues a **General Records Disposition Schedule** (with retention periods — e.g. disbursement/paid vouchers retained around a decade post-audit) and requires agencies to keep an approved Records Disposition Schedule | If the council's records are university records, "delete after N semesters" is not a technical decision alone. Adopt the **university records officer's** schedule as the source for document retention; keep the signature purge as-is (it is a privacy control, but check it against the RDS) | BC-2, NP-7, Q-5 |
| **RA 7277 (Magna Carta for PWDs) + its IRR** `[law]` (secondary) | The IRR has been read as requiring that **"all government websites shall comply with the guidelines on web accessibility"**; the NCDA's own site adopts WCAG. A state university is government | WCAG AA is not aspirational for this deployment. Target **WCAG 2.2 AA** (the current Recommendation) — including 2.5.8 Target Size (24×24 px), 2.5.7 Dragging, 2.4.11 Focus Not Obscured, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication | BC-13 |
| **Free tiers** `[tech]` | Vercel Hobby: **cron minimum interval once per day**; sub-daily expressions **fail at deployment**; up to 100 cron jobs per project; scheduling precision ±59 min. Resend free: ~100 emails/day. Supabase free: pauses on inactivity | The cron design and the email design both need rewriting before cutover | BC-3, BC-12 |

**Not yet researched by me, and worth a real lawyer's 30 minutes:** whether the council is a separate PIC or a unit of the university (Q-2), whether the fine regime survives RA 4206/5546 as applied to a student organisation (Q-1), and whether council records fall under RA 9470 (Q-5). Those three are the only items here where I would not rely on a non-lawyer.

---

## 3. Module-by-module benchmark

### 3.1 Attendance (check-in, duty, signatures)

**The industry does:** offers *several* check-in methods at one door and reports which was used; layers dynamic QR + duplicate checks + **device binding** + geofence; and increasingly treats the *record* as an engagement artefact (CampusGroups, Involve's digital ID). Commercial systems put almost no weight on signatures; we do, and it is a genuine differentiator for a council that has to answer "prove they were there" to an adviser.

**We already do well** `[code]`: server-signed rotating QR (30 s) with a scan-time-aware offline path; geofence with an accuracy allowance; per-event windows; office duty with check-in/out windows; officer delegation that expires; the method mix (`self` · `manual` · `qr` + barcode) is preserved per record; e-signature with SHA-256 and per-semester purge; the duplicate guard exists at the application layer.

**We are missing:**
- **A database guarantee against duplicates.** `model Attendance` has no unique constraint `[code]`; two officers at the same door can both pass `findFirst` and insert.
- **Idempotency for retried scans** — a queued scan whose response was lost is indistinguishable from a new scan.
- **Both timestamps on the record** — an offline scan overwrites `createdAt` with the scan moment and only the *audit log* keeps both moments `[code]`. That is correct for "when did they arrive" and wrong for "when was this row written".
- **Officer-level accountability reporting** — no per-recorder view of manual vs scanned volume, no "impossible travel", no sampling queue.
- **An explicit reason on manual entries** — `method: 'manual'` records who, not why.

**Adopt:** BC-5 (constraint + idempotency + dual timestamps), NP-4 (per-officer audit report + manual-entry reason), and a paper/batch path (NP-10) as the honest answer to a dead phone.

### 3.2 Events & calendar

**The industry does:** categories, recurrence, capacity, registration, check-in windows, a calendar an officer actually reads, and — in the good ones — a *freeze* of the participant/expected set for reporting.

**We already do well** `[code]`: categories with colour + archive-instead-of-delete; a real RRULE subset with materialised instances and the "instance 3 of 12" caption; refusing to delete instances that hold attendance or registrations; a filterable officer calendar.

**We are missing:** the report-reproducibility freeze (BC-4); **a cancellation status** — the `Event` model has no `status`/`cancelledAt` field at all `[code]`, so a cancelled event still looks like an event whose window closed and the fine cron will bill its whole audience (BC-7); a per-event **check-in window policy note** (what happens to a student who arrives 20 minutes after close — today: no record, then a fine, with no door-side record of "attempted" — an "attempted/late" note would make the excuses flow fairer); and **an end time, description and attachments on the portal event** — `description`, `venue`, `endDate` and `coverImage` exist only on the frozen public `PublicEvent` model, so the officer-side event the student sees during registration is a title and a time `[code]` (NP-13).

**Adopt:** freeze-expected (BC-4) + the cancellation status and no-fines rule (BC-7) + the missing event fields (NP-13).

### 3.3 Registration & waitlist

**The industry does:** capacity + waitlist with an **offer that expires** (the queue advances when someone declines), registration deadlines, and separate quotas for blocks (e.g. seats per college). Higher-demand campus events use **lottery** allocation rather than pure first-come.

**We already do well** `[code]`: one row per person per event, kept across cancellation so re-registration is sane; longest-waiter promotion on cancel, nobody promoted when a *waiting* person leaves; rejoining always takes the back of the queue; every move audited.

**We are missing:** an **offer window** (today a promotion is immediate and irreversible-by-design — if the promoted student sees the notification two days later, the seat is silently wasted); **capacity-change handling** (increase → promote, decrease → demote from the end, both notify); a **registration deadline**; and a **lottery mode** for the two or three events a year where FCFS causes a rush (the plan doesn't need it now — but the audience resolver should not preclude it).

**Adopt:** NP-5. Keep FCFS as the default.

### 3.4 Scanning & offline

**The industry does:** offline queues with **at-least-once delivery** semantics — which implies **deduplication on the server**; a visible "unsynced" state; and a printable fallback for the venue with bad signal.

**We already do well** `[code]`: the queue sends in scan order on reconnect/`online`/manual sync and **the server judges each scan as of the scan moment** (token lifetime, grants, window), with documented bounds (48 h max age, 5 min future skew, 15 s token skew); real refusals are parked with reasons instead of vanishing; `ApiError` distinguishes "never reached the server" from "the server said no".

**We are missing:**
- **Durability guarantees.** IndexedDB is **best-effort storage**: the browser may evict it under storage pressure with an LRU policy, and Safari proactively deletes script-written storage for origins with **no user interaction in seven days** `[tech]`. Scans taken in a dead zone and synced the next morning are exactly the data at risk.
- **An idempotency key**, so a retry never looks like a second scan.
- **A queue-depth guard** — nothing stops an officer leaving a venue with 60 unsynced scans and a closed tab.
- **A paper path** — if the phone dies, the event is over.

**Adopt:** BC-6 (`navigator.storage.persist()` on first queue write, `estimate()` checks, a persistent "N unsynced" banner, a hard cap with a loud warning, and a "needs attention" acknowledgement before ending the session) + BC-5 (idempotency) + NP-10 (printable roster with per-student barcodes and post-event bulk scan).

### 3.5 Analytics & reports

**The industry does:** dashboards that are **definitions-first** (a rate is only as good as the denominator), drill-down to the record, export of the exact filtered set, and — in anything that feeds money or discipline — a **locked snapshot** of the population as it stood at the time.

**We already do well** `[code]`: the maths is pure and unit-tested; `expectedForEvent` defines the denominator once, shared with the fines; dashboards reconcile with the raw CSV export row-for-row *in the live suite*; Student 360 with permissions (staff or self); delegates see only their event; a 24-bar timing histogram and group breakdowns.

**We are missing:** frozen snapshots (BC-4); a **data-quality panel** (records with no signature, students with no college/section, offline-synced records, manual-only records, events with no audience) — because every rate silently degrades when the reference data is incomplete; and per-report **definitions shown on the page** ("attendance rate = attendees ÷ frozen expected, excluding waived fines…").

**Adopt:** BC-4 + NP-8.

### 3.6 Notifications & announcements

**The industry does:** channels with an explicit hierarchy (in-app always, email/push opt-in), **quiet hours**, **critical vs informational** classification that ignores mute preferences, delivery logs, and honest expectations about push (iOS only delivers web push to a Home-Screen-installed PWA from iOS 16.4 onwards `[tech]`).

**We already do well** `[code]`: a notification row records the channels it actually went out on; `unique(userId, dedupeKey)` makes the reminder cron safe to re-run (proven twice in the live suite); the announcement renderer **escapes user text before tokenising** (unit-tested against `<script>`, `javascript:`, `data:`); a sent announcement is immutable; email respects per-person preferences and the Resend quota guard; the daily-quota guard never silently overspends.

**We are missing:**
- **Scheduling reality.** Sub-daily crons cannot run on Hobby, and the two scheduling crons aren't wired `[code]`. As it stands, "scheduled announcements" and "24 h / 1 h reminders" do not happen unattended.
- **A quota strategy for campus-wide mail.** ~100 emails/day against a campus audience means one all-student announcement consumes the day's budget; "refuse politely" means students silently get nothing.
- **Critical/informational** classification (a fine notice should not be muteable; a promo-ish announcement should be).
- **Quiet hours + digest** for non-urgent kinds, and a per-user send cap so one busy day doesn't spam.
- **A truthful push story** — iOS students must install the PWA before push is even possible; Android works in-browser.

**Adopt:** BC-3 (cron), BC-12 (quota-aware sending), NP-6 (classification, quiet hours, digest, retry).

### 3.7 Fines & clearance

**The industry does:** sanctions as a *policy engine* (points/strikes are at least as common as money), a dispute path, and — where money is involved — the full cash-control apparatus: numbered receipts, two-person approval, reconciliation, reversal instead of edit.

**We already do well** `[code]`: rules resolved event > category > global; **integer centavos** with a single formatter; a per-fine **rule snapshot** so a later rate change never rewrites history; `unique(userId, eventId)` as the last line of defence against double-charging; idempotent nightly generation via `events.finesIssuedAt`; explicitly "nobody outside the audience is ever charged"; excuses with object-storage evidence readable only by the owner or roster staff; a paid fine cannot be excused or waived; both review outcomes notify.

**We are missing:**
- **The authority record** for a monetary sanction (resolution reference, approver, effective date) — see Q-1 (BC-7).
- **A dispute window**: today a fine is collectible the moment it is generated; a student who was present but unscanned has only the excuse route, which is framed as "I was absent for a reason".
- **The money controls** (NP-1): OR register, collection sheet, reconciliation, void/reversal, segregation of duties, daily collection report.
- **No-fines conditions**: event cancelled, student withdrew, excuse approved before generation, duplicate enrolment.
- **A sanction-type switch** so a council that cannot lawfully charge money can still run the policy with warnings and service.

**Adopt:** BC-7, BC-8, NP-1.

### 3.8 Finance & liquidation

**The industry does** (Engage is the clearest model) `[vendor]`: **accounts** with a parent/child tree and a general-ledger root; **requests** (funding / purchase / budget) as forms with an approval workflow of **stages**; **transactions** (allocate · deposit · payment · transfer) as the only thing that moves money; **encumbered funds** held against the balance for approved-but-unpaid requests; line-item budget checks that warn when a request exceeds the approved amount. Institutional policies add the **two-signature rule**, a **monthly treasurer's report** and **periodic independent audit**.

**The plan's §8.7 is close on workflow and missing on accounting** — it has the right approval chain (body → Treasurer → President/Adviser/University Accountant → Campus Administrator) and receipt uploads, but no account model, no encumbrance, no fund restrictions (collected fines vs appropriated funds behave differently), no reversal rule, no reconciliation, and no monthly artefact.

**Adopt:** NP-1 (controls), NP-2 (encumbrance + budget vs actual + overdraft rule), NP-3 (liquidation/monthly report generator).

### 3.9 Documents & resolutions archive

**The industry does:** classification-driven visibility, **immutable versions**, per-series numbering, retention from a records schedule, and archival formats (**PDF/A, ISO 19005**) with **fixity checksums** for anything meant to last `[practice]`.

**The plan's §8.8** covers types, auto-numbering, versions, tags, visibility, full-text search and cross-links. The additions that matter: a **classification + redaction** model (minutes and resolutions name students and discuss discipline), numbering via a **sequence row rather than `max()+1`**, PDF/A + SHA-256 on upload, and **retention sourced from the university records officer** (RA 9470 / NAP GRDS) rather than invented.

**Adopt:** NP-7.

---

## 4. Amendments to the plan (ranked, patch-ready)

### 4.1 Before cutover

| ID | Rank | Target | The patch (what to add or change) | Why | Effort |
|---|---|---|---|---|---|
| **BC-1** | 1 | §8.1 (profile), §11.2, §14, new §8.9 "Privacy & consent" | Add a `consents` table (userId, purpose, noticeVersion, grantedAt, method, evidenceRef, withdrawnAt) with **three purposes**: `core_attendance` (required), `publication` (optional), `messaging` (optional). Registration captures the required one and the two optional ones separately; a "Privacy & rights" page lists purposes, retention, DPO contact and how to exercise rights. Gate registration on an "18 or over" declaration with a **guardian-consent path** for minors | The plan claims consent is done; the schema has none `[code]`. NPC 2023-04 requires demonstrable, granular consent; blanket consent is invalid; every day of unconsented collection cannot be undone | M |
| **BC-2** | 2 | §11.2 (replace the three-bullet list with a **data inventory / retention matrix**) | One table: data type → purpose → lawful basis → retention → visibility → purge mechanism. Fill in attendance, **geolocation**, signatures, fines/disputes, excuse attachments, notifications, delivery/quota rows, audit logs, documents, photos. Decide geolocation explicitly (recommend: keep `inGeofence` + accuracy **permanently**, drop raw lat/lng after the dispute window). Name the DPO and the breach runbook (72 h, NPC 16-03) | Both the NPC filing and the retention jobs need this table; "retention: extend (P8)" is not a control | M |
| **BC-3** | 3 | §11.1, §9 (P1 cutover), `CUTOVER.md`, `vercel.json` | Rewrite the cron design: **Hobby = one run per day per job, sub-daily expressions fail deployment** `[tech]`. Recommended: up to 24 *daily* entries at fixed hours (they cost nothing and stay inside the 100-job limit) so the sweeper runs hourly-ish, plus a documented external scheduler as the fallback if that feels too clever. **Add the three missing crons to `vercel.json`** (`event-reminders`, `announcements`, `event-fines`). Remove the `Access-Control-Allow-Origin: *` block from `vercel.json` | Today scheduled announcements, reminders and fine generation are built but never invoked automatically `[code]`, and the documented schedules would fail the deploy | M |
| **BC-4** | 4 | §8.2, §8.3, §8.5, §10 | Add `event_expected` (eventId, userId, audienceType, snapshotAt, source) written by the job that **closes the check-in window**. The dashboard, exports, Student 360 and the fine cron read the **snapshot**, not a live resolve. Show "frozen at ‹time›" on the dashboards. Same freeze for the fine rule (already snapshotted) and for the semester's audience membership | A dashboard read today and a PDF exported last month can disagree; a student who transfers college after the event is charged or missed. Audit and fairness alike need one immutable population | M |
| **BC-5** | 5 | §8.2, §10 (schema + API) | (a) Partial **unique index** on `(eventId, userId)` for event attendance; (b) a **`clientScanId` UUID** per queued scan, unique on the server, returned as "already recorded" (200) rather than a refusal on replay; (c) store **`scannedAt` and `recordedAt`** as separate columns on `attendance` (keep the audit detail too); (d) `POST /api/attendance` with `method: 'manual'` requires a short **reason** and records it | Two officers at one door race the app-level check; a retried queued scan currently lands as a "refusal" in the parked list; and a row whose only timestamp is the claimed scan time is not auditable | S–M |
| **BC-6** | 6 | §8.2 (offline), §10 | Before the first queued scan: call `navigator.storage.persist()` and record the result; check `navigator.storage.estimate()`. Show a **persistent "N unsynced" banner** on every officer page, refuse to end the session silently with a non-empty queue, and require an acknowledgement of the parked-refusals list. Add a hard cap (e.g. 500 pending) with a loud warning. Add a golden-path test: queue offline → reload the page → sync | IndexedDB is **best-effort**; eviction happens under storage pressure, and Safari deletes script-written storage after 7 days without interaction `[tech]` | S–M |
| **BC-7** | 7 | §8.5, §8.2, §4 (D12), §7.2, §12.2 | Add to `fine_rules`: `sanctionType` (`monetary` · `service` · `warning`), `authorityRef` (resolution no.), `authorityApprovedBy`, `effectiveFrom`. Add a **dispute window** to the fine lifecycle: `issued → disputable (n days) → payable`; a dispute is a *factual* claim ("I was present", "the event was cancelled") distinct from an excuse. **Add `status` (`scheduled` · `cancelled`) + `cancelledReason` to `Event`** and make the fine cron skip anything not scheduled — today there is no such field `[code]`, so a cancelled event generates fines for its whole audience. Add other suppressors: withdrawn, excuse filed before generation. Add a **per-semester cap** and an admin "policy changed" audit entry | RA 4206/5546 makes unsanctioned collection from students a legal risk `[law]`; the current model makes a fine collectible on the night it is generated with no cheap factual challenge — and charges for events that never happened | M |
| **BC-8** | 8 | §8.5, §11.2, §8.8 | State the rule in the plan: **the platform must never be the mechanism that blocks enrollment, examinations or credentials.** The clearance PDF/verification shows *standing*, and the **public verification page shows status + issue date + issuer only** (no student name, no amount, no reason), optionally challenge-gated by the last 4 digits of the student number. Rename the flow if needed ("Certificate of Standing") to reflect that | RA 11984 codifies the direction that payment issues must not gate academic progress `[law]`; a public page that pairs a student's identity with an unpaid fine publishes SPI to the internet | S |
| **BC-9** | 9 | §8.8, §8.7, §11.2 (public freeze boundary) | Documents get a **classification** (`public` · `officers` · `restricted`), an optional **published redacted copy** + a redaction note, and a **publish** action that is itself audited. The transparency board becomes a **periodically published aggregate document**, not a live page. Rule of thumb written into the plan: *nothing is public unless explicitly published, and no published artefact carries an unauthorised student name* | Minutes, resolutions and finance documents name students; NPC 2020-046 and 2018-020 say roster-type data is SPI and posting needs a basis `[law]` | M |
| **BC-10** | 10 | §10, §11.2 | Extend `audit_logs` with `targetType`, `targetId`, `actorRole`, `ipHash`, `requestId`; make it append-only in code (no update/delete path, asserted by a test); add audit rows for **reads** of sensitive records (Student 360, excuse attachments, student lookup); add a test that every mutating route writes an audit row; add a daily "audit health" check (counts by action + gaps in a known high-volume action) | Fines, money and privacy all rest on this log; a log that cannot prove the *target* or the *reader* is not evidence. Retrofitting evidence is impossible | M |
| **BC-11** | 11 | §11.2, §8.3 | `GET /api/privacy/me` returns a self-service bundle (profile, attendance, fines, signatures list, notifications, consents) as JSON + CSV; add a **rectification request** route (either the student edits allowed fields, or a request lands in a staff queue). Document the deletion/retention answer for graduates | DPA data-subject rights (access, rectification, portability) `[law]`, and it doubles as the best support tool the officers will ever get | S–M |
| **BC-12** | 12 | §8.4, §11.1 | Compute the **email-eligible audience** before sending and show it against the day's remaining Resend quota; require an explicit choice above the quota (spread over days, in-app + push only, or cancel), never a silent downgrade. Default email **off** for announcement-class sends; keep it on for transactional kinds (verification, reset, fine, clearance) | A campus-wide announcement can consume the entire daily email budget and deliver to nobody | S |
| **BC-13** | 13 | §10, §9 (P8 scope) | Move to **WCAG 2.2 AA** and name the new criteria (2.5.8 Target Size 24×24 px, 2.5.7 Dragging, 2.4.11 Focus Not Obscured, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication). Add an automated axe pass over the checked-in pages to CI, and a manual script for the scanner page (one-hand use, glare, small screens) | A state university is government; the RA 7277 IRR is read as requiring web accessibility `[law]`, and 2.2 AA is the current Recommendation `[tech]` | M |

#### Draft wording for the two highest-value ones

**BC-2 — replace §11.2's DPA bullet with this table (starter, to be completed with the university DPO):**

| Data | Purpose | Basis | Retention | Who sees it | Purge |
|---|---|---|---|---|---|
| Profile (name, student no., college/year/section, contact) | roster, attendance, clearance | consent (core) | active + N years, then anonymise | self, officers, university (on request) | graduate workflow |
| Attendance record | attendance, fines, reports | consent (core) | per records schedule | self, roster staff | archive |
| Attendance geolocation (lat/lng, accuracy) | door validation | legitimate interest, minimised | raw coords dropped after the dispute window; keep `inGeofence` flag | officers only | nightly job |
| Signature | proof of presence | consent (core) | N semesters (existing control) | self, roster staff, export signatories | existing purge |
| Fine + dispute + payment | finance, clearance | consent (core) / contractual | per records schedule (money) | self, Treasurer, Auditor, President, Adviser | archive |
| Excuse attachment | evidence review | consent (core) | until the fine is settled + N months | filer, reviewers | manual + job |
| Notification/delivery rows | delivery + audit | legitimate interest | short (e.g. 1 year) | self, system | job |
| Audit log | accountability | legal obligation / legitimate interest | longest applicable (money records) | Auditor, Adviser, super admin | none |

**BC-7 — add to §8.5 (after the fine-rules bullet):**

> - **Authority and sanction type.** A monetary fine is only offered when the rule carries an authority reference (the council resolution and the approving adviser/university officer) and an effective date; otherwise the rule's `sanctionType` must be `warning` or `service`. The platform does not decide whether the council may charge money — it records which decision was taken and by whom, so the policy can change without a code change.
> - **Dispute before collection.** A generated fine is `disputable` for *n* days (default 7). A dispute states a fact ("I was present", "the event was cancelled", "I was on official duty") and is decided like an excuse, but is not evidence of absence. Only after the window closes does the fine become `payable`.
> - **Nothing is charged for an event that did not happen.** `Event` gains `status` (`scheduled` · `cancelled`) and `cancelledReason`; the generation job skips anything not `scheduled`, and cancelling an event after fines were generated notifies the affected students and voids the fines with a reason.

---

### 4.2 Next phase

| ID | Target | The patch | Why | Effort |
|---|---|---|---|---|
| **NP-1** | §8.5 (P4 payments), §7.2 | Ship payments **with**: a **receipt register** (per collector, per day, gapless numbering; void, never delete), a **collection sheet** + physical cash count reconciliation (`collected − deposited = 0`), a **daily collection report**, **segregation of duties** (Treasurer records, Auditor verifies, President/Adviser approve above a threshold; requester ≠ payer), and **reversal by contra entry** (or "void with reason") instead of edit | The riskiest flow in the system currently has the fewest controls; the industry answers are receipt registers, reconciliation and two-person approval `[practice]` | L |
| **NP-2** | §8.7 | Add the accounting layer: **accounts** with a parent/ledger root, **fund classes** (appropriated / restricted / collected fines), **requests** distinct from **transactions**, **encumbrance** (approved-but-unpaid held against the balance), a budget-vs-actual view per line, and the §8.7 acceptance rule enforced as a hard gate with an audited override | Copied from the one vendor that models this properly `[vendor]`; without it "budget" is a spreadsheet number | L |
| **NP-3** | §8.7, §8.3 | A **liquidation report** generator: per project/event budget → actual → variance, receipts with checksums, signatory blocks; a **monthly Treasurer's report** PDF to the body; a semester **audit pack** (transactions, receipts, approvals, reconciliation sheets) | Institutional policy expects a monthly report and periodic independent audit `[practice]`; COA-style artefacts should be produced *by* the system | M |
| **NP-4** | §8.3, §8.2 | A **scanner accountability report**: per officer, counts by method, manual-entry rate, entries recorded outside the event window, "impossible travel" flags (two scans too far apart in too little time), scanner-device changes mid-event, and a **sampling queue** of manual entries for the Auditor. Show it on the analytics page | The recorder is the fraud surface (D7), and this is the cheap control that works in a web app, unlike mock-location detection | M |
| **NP-5** | §8.2 | **Offer-window promotions** (promote → offer expires in n hours → next waiter), **capacity change** handling (increase promotes in order; decrease demotes from the end and notifies), a **registration deadline** field, and a per-college/seats-per-block allocation option if the council ever needs it | FCFS with instant, irreversible promotion wastes seats and generates support tickets | M |
| **NP-6** | §8.4 | Notification **classification** (`critical` bypasses mute and quiet hours; `informational` respects them), quiet hours (Asia/Manila), a **digest** for low-priority kinds, per-user rate limits, delivery retry with backoff, and an in-product truth about push (iOS needs the installed PWA; Android works in-browser) | Fine and clearance notices must not be muteable; a notification system students mute is a notification system that failed | M |
| **NP-7** | §8.8 | Documents: **PDF/A (ISO 19005)** for archival copies + **SHA-256 fixity** on upload, immutable versions (re-upload = new version, never overwrite), **per-series numbering via a sequence row** (not `max()+1`), classification + published redacted copy, and retention taken from the university records officer / NAP GRDS | Archival integrity and a lawful retention basis `[law]` `[practice]` | M–L |
| **NP-8** | §8.3 | A **data-quality panel**: records without signatures, students missing college/section, offline-synced records, manual-only records, events with no resolved audience, unclosed windows; plus report **definitions** rendered on each dashboard | Every rate silently degrades when reference data is incomplete; officers need to see the flaw, not the number | S–M |
| **NP-9** | new §8.10 "Student self-service" | A student page: my attendance, my fines, my notifications, my consents, export my data, request a correction, request deletion after graduation | DPA rights, and it removes most officer support traffic | M |
| **NP-10** | §8.2 | **Paper/batch fallback**: a printable roster with a per-student barcode/QR, and an "end-of-event reconciliation" screen (scanned N of expected M, who is missing, "record the missing from the printed sheet") | The industry's real answer to dead signal or a dead battery is paper plus a fast catch-up path | M |
| **NP-11** | §10 | Performance budgets as gates, not adjectives: a separate scanner route bundle (<150 KB JS target), lazy-load FullCalendar/Unovis/Tiptap off the scanner and public routes, EXIF-strip photo uploads, a throttled-CPU + 4G Lighthouse run in CI, and a payload check on the scan POST | Low-end Android Chrome in a gym with weak signal is the realistic device; the plan's targets are untested adjectives today | M |
| **NP-12** | §11.2, public freeze | Photo pipeline consent + takedown: a per-student "my photo may appear on the public site" preference, a takedown route, EXIF stripping, and a retention rule for event photos | Publishing a student's photo is publishing personal data; the gallery exists already | S–M |
| **NP-13** | §8.2 | Complete the portal event record: **`description`**, **`endsAt`**, free-text **venue**, **attachments** and a cover image (all of these exist today only on the frozen public `PublicEvent`) `[code]`. Surface them on the student's registration card, the notification copy, the calendar tooltip and the printed door sheet | A student registering for an event can currently see a title and a time; the officers know more than the platform shows, so the information travels in group chats | S |

### 4.3 Backlog

| ID | Target | The patch | Why it waits |
|---|---|---|---|
| **BL-1** | §11.2 | **Hash-chained audit log** (`prevHash` per row) + a daily digest stored outside the DB; a verification tool | Worth it once money is live; before that it is ceremony |
| **BL-2** | §8.2 | Native/hybrid scanner shell (Capacitor) with **Play Integrity / DeviceCheck** attestation and mock-location detection | Only if fraud actually appears; a web app cannot attest a device, and the detector is a cat-and-mouse game |
| **BL-3** | §8.7 | Full **double-entry** ledger + chart of accounts + trial balance | NP-2 gets 90% of the value; double-entry is the right answer if the council ever holds real funds |
| **BL-4** | §8.6 | Elections extras when un-deferred: turnout-only live view, post-close tally with a reproducibility check, a "your ballot was counted" **nonce** — never a per-vote receipt that could prove how someone voted | Deferred by D8; the receipt design risk should be fixed before the spec is used |
| **BL-5** | §8.3 | Materialised/summary analytics views + per-semester snapshots | Needed at 100k+ attendance rows, not at 10k |
| **BL-6** | §8.4 | Background Sync / Periodic Background Sync for Chromium, and an SMS channel via a PH gateway | SMS costs money (₱0 budget) and Background Sync is Chromium-only |
| **BL-7** | §10 | A published **accessibility conformance statement** (VPAT-lite) | Good after BC-13 has a track record |
| **BL-8** | §11.2 | Alumni/graduate data lifecycle: anonymise after N years, keep aggregates only | Needs the retention matrix (BC-2) first |

---

## 5. Industry-grade checklist per module

Legend: ✅ in place · 🟡 partial · ❌ missing · ➡ action (amendment id).

| Module | Money | Audit trail | Privacy / DPA | Accessibility (AA) | Offline / poor signal | Low-end Android | Exportability |
|---|---|---|---|---|---|---|---|
| **Attendance** | n/a | 🟡 audit rows on writes; **❌ no read logging** ➡ BC-10 | 🟡 signature retention exists; ❌ consent + geolocation retention ➡ BC-1, BC-2 | 🟡 Nuxt UI primitives; ❌ untested ➡ BC-13 | ✅ scan-time-aware queue | 🟡 scanner on the same bundle as the rest ➡ NP-11 | ✅ PDF/XLSX/CSV with signature column |
| **Events** | n/a | 🟡 writes audited; ❌ no cancellation status ➡ BC-7 | 🟡 audience is SPI — never public ➡ BC-9 | 🟡 calendar keyboard support unverified ➡ BC-13 | n/a (staff) | 🟡 FullCalendar bundle ➡ NP-11 | ✅ CSV/PDF |
| **Registration** | n/a | ✅ every move audited | 🟡 roster = SPI; delegate scope is per-event ✅ | 🟡 | ✅ registration is online-only by nature | ✅ small payload | ✅ roster export |
| **Scanning / offline** | n/a | 🟡 sync moments in audit detail; ❌ dual columns ➡ BC-5 | ✅ lookup returns name/number only, max 8 rows | ❌ scan page needs a one-hand/glare pass ➡ BC-13 | 🟡 **best-effort storage, no idempotency** ➡ BC-5, BC-6 | 🟡 BarcodeDetector is Chrome-Android-only; polyfill carries the rest `[tech]` | ➡ add "queued/offline" column to exports (BC-5) |
| **Analytics** | n/a | 🟡 definitions unit-tested; ❌ no frozen snapshot ➡ BC-4 | ✅ staff-only; delegate scoped; Student 360 = staff or self ✅; ❌ no-show lists must never leave the officer surface ➡ BC-9 | 🟡 hand-rolled bars, colour-only encodings ➡ BC-13 | n/a | 🟡 Unovis bundle ➡ NP-11 | ✅ CSV; ➡ XLSX/PDF everywhere (P1 goal) |
| **Notifications** | n/a | ✅ delivery log = the notification row, dedupe-keyed | 🟡 preferences ✓; ❌ critical/informational ➡ NP-6 | 🟡 email templates untested for contrast/alt text ➡ BC-13 | ✅ in-app is the primary channel | ✅ | 🟡 ➡ delivery-log export |
| **Fines / clearance** | 🟡 centavos + rule snapshots ✅; ❌ receipt register, reconciliation, void/reversal, segregation ➡ NP-1 | 🟡 issuance audited; ❌ dispute + authority fields ➡ BC-7 | 🟡 never outside audience ✅; ❌ public verification leaks identity ➡ BC-8 | 🟡 | ✅ in-app | ✅ | ✅ list export; ➡ statement per student |
| **Finance / liquidation** | ❌ not built — build NP-1/NP-2 **with** the module | ❌ every approval step must be audited (it is in the plan) ✅ intended | 🟡 receipts may contain third-party names ➡ classify | ❌ | n/a | ✅ | ❌ ➡ monthly report + audit pack (NP-3) |
| **Documents** | n/a | ➡ publish/version actions audited (BC-9) | ❌ classification + redaction + retention basis ➡ NP-7 | ➡ published PDFs need tagged text or an HTML twin (BC-13) | n/a | ✅ | ➡ PDF/A + checksum (NP-7) |

**The seven axes, as promises worth writing into §10:**

1. **Money** — integer centavos everywhere (done), one formatter (done), **no edit of a posted transaction** (reversal only), receipts gapless per collector, physical cash reconciled daily, two people on every movement above a threshold, and "requires authority" metadata before anything can be marked collectible.
2. **Audit trails** — every write audited with actor, target type and id, before/after where it matters; sensitive **reads** logged; the log is append-only and exportable; a test proves coverage.
3. **Privacy / DPA** — a data inventory with retention; consent recorded per purpose with a notice version; minors handled; nothing public unless published; a 72-hour breach runbook; DPO contact visible.
4. **Accessibility** — WCAG 2.2 AA; automated axe in CI; the scan flow tested one-handed in glare; exported PDFs have a text-first twin.
5. **Offline / poor signal** — queued work is persisted, visible, capped, deduplicated, and acknowledged before the session ends; a paper path exists; the server judges as of the scan moment (done).
6. **Low-end Android Chrome** — route-level bundle budgets, no heavy libraries on the scan path, uploads direct to object storage via presign (done), and a throttled-CPU Lighthouse gate.
7. **Exportability** — every list filters and exports the **current filter** (mostly done); every module has a "give me the whole record" path for both a data subject and an auditor.

---

## 6. Where our plan is wrong

### W1 — "Consent at registration (done)" is not true `[code]`

§11.2 states it as a completed control. `prisma/schema.prisma` has no consent, notice-version, or agreement column anywhere, and `server/api/auth/register.ts` does not record one. Because attendance, section, fines, geolocation and signatures are all sensitive personal information, the entire §11.2 section currently rests on a statement that the code does not support. This is the single most urgent item in this document, and it is urgent precisely because it is retroactive: consent obtained after the fact does not cover the processing already done, and the pilot event is the first irreversible collection.

### W2 — DPA artefacts are scheduled at P8, after the pilot has already created the data

P8 is "Accessibility, performance, **DPA paperwork**, load test, pilot event, training" — the paperwork is listed *with* the pilot, so in practice it will follow it. Reorder: **the artefacts** (inventory + retention matrix, consent capture, privacy notice page, breach runbook with the 72-hour clock, DPO contact, NPC registration decision) belong before the pilot; **the filing** (NPC registration or the Annex 1 sworn declaration) can stay at P8 with its 20-day clock starting at launch. This is BC-1, BC-2 and BC-6.

### W3 — Money is being built in the wrong order, and in the wrong module

Payments land in P4 (fines) and the finance controls land in P6 — a full phase later. That inverts the risk: the council will be collecting **cash** in P4 with no receipt register, no reconciliation, no reversal path and no segregation of duties, while P6 builds a beautiful budget workflow that never touches the cash. Build the **controls with the collection** (NP-1) and let P6 add the accounting layer (NP-2/NP-3). Concrete minimum for P4d: gapless receipt numbers per collector, a daily collection report, a cash-count reconciliation screen, void-with-reason, and a second pair of eyes (Auditor "verified" flag) on the collection.

### W4 — The cron design cannot be deployed as documented, and three crons are not deployed at all `[tech]` `[code]`

`CUTOVER.md` documents `0 * * * *` and `*/15 * * * *`; Vercel Hobby rejects anything more frequent than daily **at deploy time**, and `vercel.json` currently contains only the signature purge. So: (a) the deploy will fail when the crons are added, or (b) they are never added and scheduled announcements, reminders and fine generation silently never run. Also, "24 h **and 1 h** reminders" cannot be delivered by a once-a-day job with ±59-minute precision without a workaround. Fix in BC-3, and change the product promise if the workaround is rejected (e.g. "the evening before and the morning of").

### W5 — We are investing in anti-spoofing where the fraud surface actually is

Per D7, **officers** record attendance. A student cannot check themselves in, so a spoofed GPS location buys an attacker almost nothing unless the *officer* is the attacker — and the geofence is validated on the officer's device. Meanwhile a browser cannot tell a real GPS fix from a mock provider (no web API exposes it), so "device binding" is at best a claim the client makes about itself. The controls that actually work here are: an accountable recorder (named officer on every record — already true), a **manual-entry reason** (BC-5d), a **per-officer method-mix and anomaly report** (NP-4), a **sampling queue** for the Auditor, and the post-hoc ability to void a record with a reason. Spend the effort there, not on geofence exotica.

### W6 — Reports and fines are not reproducible

§8.3's acceptance test reconciles a dashboard against a CSV **at the same moment**. Nothing freezes the population, so an October report and a November report over the same event can differ, and the same live resolve feeds the fine cron. For a system whose outputs are used to charge money and answer "was I required to attend?", the population must be snapshotted at window close (BC-4). I would treat this as a correctness bug, not a nice-to-have.

### W7 — Three things to drop or change

1. **The public transparency board (live page).** Financial transparency is a good value, but a live DB-driven public page is a privacy surface and a support burden for marginal benefit. Publish an **aggregate document** on a schedule (BC-9).
2. **A clearance verification QR that shows the student's details to anyone who holds the link.** Keep the verification, make it minimal and challenge-gated (BC-8). A clearance code that reveals "‹name› owes ₱450" is publishing sensitive personal information to the internet.
3. **The elections "receipt code to confirm their ballot was counted"** (deferred spec). A per-vote receipt that ties a voter to a ballot defeats ballot secrecy the moment it can be shown to a vote buyer. Keep a **counted-nonce** that proves inclusion in the tally without identifying the ballot (BL-4).

### W8 — The quality bar promises tests the repo does not have `[code]`

§10 requires "Playwright test for the main UI flow on mobile (375 px) and desktop" and a "load test"; `package.json` has neither Playwright nor an axe dependency, and there is no a11y check anywhere. Also "tables handle 10k rows with server pagination" is an assertion, not a measurement. Either build the gate or rewrite the bar — a definition of done that nobody can run is theatre, and it is exactly the kind of thing that quietly disappears at P8.

### W9 — Constitutional risk: fines, minors and the university's blessing

Two exposures the plan does not currently address: the **legal basis for collecting money from students** (Q-1) and the fact that some first-year students are **minors**, whose consent must come from a parent or guardian `[law]`. Both are decisions, not code. Both should be answered **before the pilot**, because they change the consent flow (BC-1) and the fines default (BC-7).

### W10 — A missing safeguard with no upside: phantom fines for cancelled events

The `Event` model has no status field `[code]`. Every path in the fines story assumes the event happened: the cron takes "every past event whose window has closed", resolves the required audience and plans fines. Cancel a General Assembly for a typhoon — a normal occurrence in Iloilo — and the next nightly run bills the entire required audience, notifying each of them, and the only remedy is 1,500 individual waivers. This is a one-field fix that has to land with the fines module (BC-7), and it is the kind of thing that destroys trust in a system on first contact with reality.

---

## 7. Decisions needed from the owner (ready to paste into §12.2)

| # | Question | Why it blocks | Needed by |
|---|---|---|---|
| **Q-New-1** | **Fines: is the monetary sanction authorised?** What in the council's constitution/by-laws/charter, and which approval (adviser? university?), permits collecting money from students for absence or lateness — given RA 4206 as amended by RA 5546 (collection of contributions from students prohibited, narrow exceptions) `[law]`? If the answer is thin, do we default `sanctionType` to `service`/`warning` and keep money opt-in? | It changes the fine schema (authority fields), the defaulter experience and the P4d scope; and it is the difference between a policy dispute and a legal one | P4d (before payments) |
| **Q-New-2** | **Who is the Personal Information Controller for this platform** — ISUFST or the USC? Has the university's DPO (a) already registered the campus's DPS, (b) will they add this platform to that registration, or (c) should the council file the Annex 1 sworn declaration? Who signs as DPO, and what is the position-based DPO email? | Registration has a 20-day clock from launch; the privacy notice, the breach runbook and the retention matrix all hang off the answer | Before pilot |
| **Q-New-3** | **Finance: confirm the approval chain and who counts as an approver** (§12.2 Q15 restated with a sharper edge) — specifically, does the council want **segregation of duties** (Treasurer records / Auditor verifies / President+Adviser approve above a threshold), and does the University Accountant want read access to the receipts, or only the signed copies? | NP-1 and NP-2 cannot be built without it, and the capability matrix in §7.2 needs to change | P6 (or P4d if payments ship first) |
| **Q-New-4** | **Clearance:** does anything outside the council (the university, a college, an org) rely on the council's clearance as a *condition*? If yes, this needs the university's written agreement and a rule that the platform never blocks credentials, enrollment or examinations `[law]` | The clearance PDF and the verification page design depend on it; a public verification page that identifies a debtor is the risk | P4d |
| **Q-New-5** | **Records:** is the council covered by the university's Records Disposition Schedule (RA 9470/NAP GRDS), and who is the records officer we take retention periods from? Specifically: are minutes and resolutions permanent records? | Document retention cannot be invented; it also settles how long fine/dispute and attendance records live | P7 |
| **Q-New-6** | **Cron workaround:** accept a 24-entry daily cron table (hourly-ish sweeps inside the free tier), or approve a free external scheduler (cron-job.org / Cloudflare Worker / GitHub Actions) hitting the same `CRON_SECRET` endpoints, or change the reminder promise to "the evening before + the morning of"? | Blocks cutover (BC-3) and the P3 notification promise | Now |
| **Q-New-7** | **Windows/Android share of the officers' phones** — do we commit to Chromium as the supported scanner browser, or must the scan page work in iPhone Safari (where the barcode polyfill carries the load and push requires an installed PWA)? | Determines the scanner bundle, the push expectations and the training material | P2 finish |

---

## 8. Sources

**Industry, vendor documentation (indicative, not independently verified)**
1. Ready Education — *Streamline university event management* (check-in options, dynamic self-check-in QR): <https://www.readyeducation.com/campusgroups/streamline-university-event-management-campusgroups/>
2. Ready Education — *Student engagement* (app check-ins, QR, self check-in): <https://www.readyeducation.com/solutions/student-engagement/>
3. Wharton/UPenn support — *CampusGroups events: checking in attendees*: <https://support.wharton.upenn.edu/help/campusgroups-checking-in-event-attendees>
4. Anthology — *Walkthrough: Organization Accounting* (accounts, parent/general ledger, requests, stages, transactions): <https://help.anthology.com/engage/en/walkthrough--organization-accounting.html>
5. Anthology — *Term review: Organization Accounting & Budgeting* (encumbered funds, stage definitions, request vs transaction): <https://support.anthology.com/s/article/204032614-Term-Review-Organization-Accounting-Budgeting>
6. Anthology — *Submitting purchase, funding and budgeting requests* (requests do not move money; over-budget warning): <https://support.anthology.com/s/article/204033784-Submitting-Purchase-Funding-and-Budgeting-Requests-for-Your-Organization>
7. Anthology — *Using Engage for Student Government initiatives*: <https://help.anthology.com/engage/en/using-engage-for-student-government-initiatives.html>
8. Modern Campus — *Student engagement and learning platform* (Involve, formerly Presence): <https://moderncampus.com/products/student-engagement-and-learning-platform> · acquisition/rebrand note: <https://moderncampus.com/newsroom/modern-campus-acquires-presence.html>
9. Modern Campus Involve support — *Event check-in* (PIN, staff scanning attendees in): <https://involve-support.moderncampus.com/hc/en-us/articles/29387515153549-Event-Check-In-August-2024-Webinar>
10. OmegaFi — *Financial management / billing & payments*: <https://www.omegafi.com/solutions/financial-management>

**Institutional practice (student-organisation finance controls)**
11. GVSU — *Registered Student Organization handbook: managing your account* (two-signature checking accounts): <https://www.gvsu.edu/rsohandbook/managing-your-account-17>
12. WVU — *Student Organization Classification System Policy* (expenditures over $100 require two signatures; expenditures approved): <https://studentengagement.wvu.edu/files/d/70dc7b5b-3ea0-42d0-80ea-d9f5126d588e/student-organizations-classification-system_policy.pdf>
13. Penn State — *Procedure SA6003, Student Government* (authorized signatories, two signatures): <https://guru.psu.edu/procedures/sa6003>
14. University of Minnesota, Student Unions & Activities — *Financial best practices* (regular independent audits): <https://sua.umn.edu/financial-best-practices>
15. MoneyMinder — *Student organisation finances: a semester-by-semester guide* (monthly treasurer's report to leadership): <https://moneyminder.com/blog/student-organization-finances-a-semester-by-semester-guide-for-college-treasurers/>

**Philippine law, NPC issuances and standards**
16. RA 10173, *Data Privacy Act of 2012* (full text, NPC): <https://privacy.gov.ph/data-privacy-act/> · Supreme Court E-Library copy: <https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/50253>
17. *Implementing Rules and Regulations of the DPA* (NPC; IRR §46–47 on registration): <https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/> · PDF: <https://privacy.gov.ph/wp-content/uploads/2023/06/IRR_RA-10173-as-amended.pdf>
18. NPC Circular No. 2023-04, *Guidelines on Consent* (demonstrable, granular, layered notice, no bundled consent): text mirror <https://lockex21.github.io/npc-issuances/issuances/2023/guidelines-on-consent> (originating from privacy.gov.ph)
19. NPC Circular No. 2022-04, *Registration of Data Processing System and Data Protection Officer* (thresholds, 20-day clock, Annex 1 sworn declaration): <https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04-2.pdf> · FAQ: <https://privacy.gov.ph/pips-and-pics/faqs/>
20. NPC — *Breach reporting* (72 hours): <https://privacy.gov.ph/pips-and-pics/breach-reporting/> · 2026 procedure update (full report within five days): <https://www.bakermckenzie.com/en/insight/publications/2026/06/philippines-data-breach-notification-procedure-further-clarified>
21. NPC — show-cause orders for unregistered controllers (declaration and undertaking required even below the thresholds): <https://privacy.gov.ph/npc-to-issue-show-cause-orders-to-unregistered-businesses-handling-personal-data/>
22. DP Council for Education — *Education Sector Advisory No. 2020-1: Data privacy and online learning* (education is SPI; minors' consent from parents/guardians; three-part legitimate-interest test): <https://www.privacy.gov.ph/wp-content/uploads/2020/10/DP-Council-Education-Sector-Advisory-No.-2020-1.pdf>
23. NPC Privacy Policy Office — *Advisory Opinion No. 2020-046* (class roster items = sensitive personal information): <https://www.privacy.gov.ph/wp-content/uploads/2020/12/Redacted-Advisory-Opinion-No.-2020-046.pdf>
24. NPC Privacy Policy Office — *Advisory Opinion No. 2018-020* (posting names under legitimate interest; consent recommended): <https://privacy.gov.ph/wp-content/uploads/2022/01/AdOpNo.2018-020.pdf>
25. RA 4206 as amended by **RA 5546** (prohibition on collecting contributions from students, colleges and universities included): <https://lawphil.net/statutes/repacts/ra1969/ra_5546_1969.html>
26. **RA 11984**, *No Permit, No Exam Prohibition Act* (covers HEIs; disadvantaged students; preserves withholding of credentials for unpaid fees): <https://www.lawphil.net/statutes/repacts/ra2024/ra_11984_2024.html>
27. **RA 9470**, *National Archives of the Philippines Act of 2007* (no disposal of public records without NAP authority; general records disposition schedule): <https://www.lawphil.net/statutes/repacts/ra2007/ra_9470_2007.html> · NAP GRDS copy (UP-hosted): <https://osu.up.edu.ph/wp-content/uploads/2016/03/10-Annexes_04.pdf> · NAP General Circular No. 5 / new GRDS (DOLE Region 12 memo): <https://ro12.dole.gov.ph/wp-content/uploads/2024/02/Memo-no.-96-24-NAP-General-Circular-no.5-Guidelines-on-the-Disposal-of-Valueless-Records-in-Government-Agency-and-New-NAP-General-Records-Disposition-Schedule-1.pdf>
28. CHED — *CMO No. 09, s. 2013, Enhanced policies and guidelines on student affairs and services* (student services funds must be judiciously disposed): <https://legacy.ched.gov.ph/wp-content/uploads/2017/10/CMO-No.09-s2013.pdf> · *CMO No. 18, s. 2026* (successor, Student Affairs and Services): <https://cms-cdn.e.gov.ph/CHED/pdf/2026-CMO-18.pdf>
29. **RA 7277** (Magna Carta for Persons with Disability), NCDA page: <https://ncda.gov.ph/disability-laws/republic-acts/republic-act-7277/> · Bokingkito et al., *Are we inclusive? Accessibility challenges in Philippine e-government websites* (quotes the IRR's web-accessibility requirement; MDPI Informatics 2025): <https://www.mdpi.com/2227-9709/12/2/41>

**Technical**
30. Vercel — *Cron jobs usage & pricing* (Hobby: 100 jobs, **minimum interval once per day**, sub-daily expressions fail deployment, ±59 min precision): <https://vercel.com/docs/cron-jobs/usage-and-pricing>
31. MDN — *Storage quotas and eviction criteria* (best-effort vs persistent, LRU eviction under storage pressure, Safari's proactive 7-day eviction, `navigator.storage.persist()`): <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
32. web.dev — *Persistent storage*: <https://web.dev/articles/persistent-storage>
33. Apple — *Sending web push notifications in web apps and browsers* (iOS 16.4+, Home Screen web apps): <https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers>
34. MDN/caniuse — `BarcodeDetector` (Chrome/Android full; Safari macOS only; not Firefox; iOS WebKit bug open): <https://caniuse.com/mdn-api_barcodedetector> · <https://bugs.webkit.org/show_bug.cgi?id=281848>
35. Microsoft Azure Architecture Center — *Idempotent consumer pattern* (at-least-once delivery ⇒ deduplicate): <https://learn.microsoft.com/en-us/azure/architecture/patterns/idempotent-consumer>
36. W3C — *Web Content Accessibility Guidelines (WCAG) 2.2*: <https://www.w3.org/TR/WCAG22/> · summary of the new criteria: <https://tetralogical.com/blog/2023/10/05/whats-new-wcag-2.2/>
37. New York State Archives — *Using PDF/A as a preservation format*: <https://www.archives.nysed.gov/records/using-pdfa-preservation-format> · Digital Preservation Coalition — *Fixity and checksums*: <https://www.dpconline.org/handbook/technical-solutions-and-tools/fixity-and-checksums>
38. WappBlaster — *Anti fake-GPS: blocking mock location* (directional evidence for mock-location detection being a native capability): <https://wappblaster.com/blog/anti-fake-gps-tech-explained/>
