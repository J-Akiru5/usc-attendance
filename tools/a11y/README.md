# Portal accessibility gate — WCAG 2.2 AA (BC-13)

The USC portal is a service of a state university. The IRR of **RA 7277** (Magna Carta for Persons with Disabilities) is read as requiring government websites to follow the web-accessibility guidelines, and **WCAG 2.2 AA** is the current W3C Recommendation. This gate is the automated half of that commitment; the manual half is written down below so it can be run by a person, not implied.

> **Scope:** the portal only. The 14 public routes named in [`docs/PUBLIC-SITE-FREEZE.md`](../../docs/PUBLIC-SITE-FREEZE.md) are frozen byte-for-byte and are guarded by [`tools/public-parity`](../public-parity) (28/28). This suite deliberately does **not** scan them: a finding there could not be fixed without breaking the freeze, and the parity gate is the correct gate for that surface.

## What runs

`portal.a11y.ts` opens each route at **desktop (1440×900)** and **mobile (Pixel 7)**, waits for hydration and webfonts, freezes motion, then runs:

1. **axe-core** (`@axe-core/playwright`) restricted to `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`.
   **Serious and critical** violations fail the run. Moderate/minor findings are counted in the run annotation and the full axe JSON is attached to the Playwright report when the route fails; they do not fail the build because several are advisory or need a human decision (for example, a heading level used for visual size).
2. **One `main` landmark** and `lang="en"` on every route (2.4.1 / 3.1.1).
3. **The skip link** is the first link, is off-screen until focused, becomes visible on focus, and moves focus to `#main-content` (2.4.1, 2.4.7, 2.4.11).
4. **A 24×24 px target-size heuristic** (2.5.8) over buttons, selects, file/checkbox/radio inputs and block-level links. Inline links are exempt, as the criterion says. A wrapping `<label>` counts as the checkbox/radio hit area.

### Routes

| Signed out (always) | Signed in (with the seeded staff account) |
|---|---|
| `/login` | `/dashboard` |
| `/reset-password` | `/manage/events` (the Create Event form is opened first) |
| `/register` | `/scan` |
| | `/fines` (the excuse form is opened when a fine exists) |
| | `/manage/fines` |
| | `/notifications` |
| | `/check-in` |
| | `/qr` |
| | `/duty` |
| | `/change-password` |

`13 routes × 2 viewports = 26 axe scans`, plus the skip-link check. A typical run is well under the 3-minute budget.

The authenticated list is deliberately the **portal shell and the pages this slice owns**. Manager pages whose forms have not been labelled yet (`/manage/students`, `/manage/analytics`, `/manage/settings`, `/manage/calendar`, `/manage/announcements`, `/manage/documents`, `/manage/finance`, `/manage/schedules`, `/manage/academics`, `/manage/users`) are **known gaps** — add them to `SIGNED_IN_ROUTES` after their form controls get labels, otherwise the gate would be red for known reasons and stop being useful.

## Run it

```bash
cd tools/a11y
npm ci
npx playwright install chromium        # once per machine

# The runner starts Nuxt itself when A11Y_BASE_URL is not set:
npm test

# Or point it at a preview/production-like build:
A11Y_BASE_URL=http://localhost:3000 npm test
```

Signed-in coverage needs a seeded staff/super-admin account **whose temporary password has already been changed** (an account with `mustChangePassword` is redirected to `/change-password` on every route):

```bash
A11Y_EMAIL=officer@example.invalid A11Y_PASSWORD='…' npm test
```

PowerShell:

```powershell
$env:A11Y_EMAIL='officer@example.invalid'
$env:A11Y_PASSWORD='…'
npm test
```

`global-setup.ts` signs in once through `/login` and saves the cookie jar to `playwright/.auth/staff.json`. Without the two variables the signed-in tests are **skipped with a printed notice**; set `A11Y_REQUIRE_AUTH=1` to turn that into a failure (use it on the machine that is supposed to have credentials).

## CI

[`.github/workflows/a11y.yml`](../../.github/workflows/a11y.yml) runs on pull requests and pushes that touch the portal. There are two modes:

**Local build (default, no repository variable).** It runs `npm ci`, `npm run build` with placeholder `NUXT_PUBLIC_SUPABASE_*` values (no database is needed to render the signed-out screens), starts `node .output/server/index.mjs`, runs `node tools/a11y/check-scanner-bundle.mjs`, installs Chromium and runs `npm test`. This gates the three signed-out screens and the scanner bundle.

**Stable preview (repository variable `A11Y_BASE_URL`).** Set `A11Y_BASE_URL` to a preview backed by the seeded Supabase project and the development database; the workflow skips the local build, signs in with `A11Y_EMAIL`/`A11Y_PASSWORD` and scans the ten signed-in routes as well. This is the only mode in which the authenticated gate is real: a local build with the placeholder Supabase cannot authenticate.

Optional repository secrets `A11Y_EMAIL` and `A11Y_PASSWORD` enable the signed-in routes. Without them the workflow still gates the signed-out screens and prints a notice. **Until the preview variable and the two secrets exist, the CI job does not gate the ten portal screens.** This is stated here rather than hidden: the shell and the named pages were fixed and the runner is ready, but the authenticated gate needs a seeded account.

Set the repository variable `A11Y_REQUIRE_AUTH=1` once the preview and secrets are in place, so a missing/expired account fails loudly instead of silently shrinking coverage.

The workflow uploads the Playwright HTML report, the axe JSON attachments and the scanner-bundle log for every run.

## Automated vs manual — WCAG 2.2 AA

Legend: **A** = axe rule(s), **C** = custom assertion in `portal.a11y.ts`, **M** = manual (script below), **N/A** = no such content in the portal.

| SC | Criterion (AA unless noted) | Status |
|---|---|---|
| 1.1.1 | Non-text Content (A) | **A** — `image-alt`, `object-alt`, `svg-img-alt`, `area-alt`, `input-image-alt` |
| 1.2.1–1.2.5 | Prerecorded/live media | **N/A** in the portal (no audio/video player); the frozen public site is out of scope |
| 1.3.1 | Info and Relationships (A) | **A** partial — headings, lists, landmarks, labels; **M** for table relationships |
| 1.3.2 | Meaningful Sequence (A) | **A** partial — source order; **M** with a screen reader |
| 1.3.3 | Sensory Characteristics (A) | **M** |
| 1.3.4 | Orientation | **M** — rotate phone on every screen |
| 1.3.5 | Identify Input Purpose (AA) | **M** — autocomplete on name/email/password |
| 1.4.1 | Use of Color (A) | **M** — status never colour-only |
| 1.4.2 | Audio Control (A) | **N/A** |
| 1.4.3 | Contrast (Minimum) (AA) | **A** — `color-contrast` (incomplete results reviewed manually) |
| 1.4.4 | Resize Text (AA) | **M** — 200 % |
| 1.4.5 | Images of Text (AA) | **M** |
| 1.4.10 | Reflow (AA) | **M** — 320 CSS px / 400 % zoom |
| 1.4.11 | Non-text Contrast (AA) | **M** — focus rings, borders, icons, charts |
| 1.4.12 | Text Spacing (AA) | **M** |
| 1.4.13 | Content on Hover or Focus (AA) | **M** — account menu, column chooser |
| 2.1.1 | Keyboard (A) | **A** partial (`scrollable-region-focusable`, `nested-interactive`, `frame-focusable-content`) + **M** |
| 2.1.2 | No Keyboard Trap (A) | **M** |
| 2.1.4 | Character Key Shortcuts (A) | **N/A** — no single-key shortcuts |
| 2.2.1 | Timing Adjustable (A) | **M** — the 30 s QR refreshes itself; the officer scan window is policy, not a user task |
| 2.2.2 | Pause, Stop, Hide (A) | **M** — auto-refreshing QR, animated banners |
| 2.3.1 | Three Flashes (A) | **N/A** |
| 2.4.1 | Bypass Blocks (A) | **C** — skip link, first link, moves focus to `main` |
| 2.4.2 | Page Titled (A) | **A** — `document-title`; **M** because the portal still shares one title |
| 2.4.3 | Focus Order (A) | **A** partial (`tabindex`) + **M** |
| 2.4.4 | Link Purpose in Context (A) | **A** partial (`link-name`) + **M** |
| 2.4.5 | Multiple Ways (AA) | **M** — sidebar + bottom nav + dashboard links |
| 2.4.6 | Headings and Labels (AA) | **A** partial (`label`, `label-title-only`, `empty-heading`) + **M** |
| 2.4.7 | Focus Visible (AA) | **C** — the portal shell defines a two-tone `:focus-visible` ring; **M** visual check |
| **2.4.11** | **Focus Not Obscured (Minimum) (AA, 2.2)** | **M** — sticky header, bottom nav, on-screen keyboard |
| 2.5.1 | Pointer Gestures (A) | **M** |
| 2.5.2 | Pointer Cancellation (A) | **M** |
| 2.5.3 | Label in Name (A) | **A** partial (`label-content-name-mismatch`) + **M** |
| 2.5.4 | Motion Actuation (A) | **M** — no shake/tilt action |
| **2.5.7** | **Dragging Movements (AA, 2.2)** | **M** — map marker drag has the lat/lng inputs as a single-pointer alternative; signature pad |
| **2.5.8** | **Target Size (Minimum) (AA, 2.2)** | **C** — 24×24 heuristic + **M** for links/inline exceptions |
| 3.1.1 | Language of Page (A) | **A** (`html-has-lang`, `html-lang-valid`) + **C** `lang="en"` |
| 3.1.2 | Language of Parts (AA) | **A** partial (`valid-lang`) + **M** |
| 3.2.1 | On Focus (A) | **M** |
| 3.2.2 | On Input (A) | **M** |
| 3.2.3 | Consistent Navigation (AA) | **M** |
| 3.2.4 | Consistent Identification (AA) | **M** |
| 3.2.6 | Consistent Help (A, 2.2) | **M** — the auth layout help line |
| 3.3.1 | Error Identification (A) | **M** — errors use `role="alert"` and text |
| 3.3.2 | Labels or Instructions (A) | **A** — `label`, `select-name`, `form-field-multiple-labels` |
| 3.3.3 | Error Suggestion (AA) | **M** |
| 3.3.4 | Error Prevention (Legal, Financial, Data) (AA) | **M** — payment, fine, clearance, cancellation |
| **3.3.7** | **Redundant Entry (A, 2.2)** | **M** |
| **3.3.8** | **Accessible Authentication (Minimum) (AA, 2.2)** | **M** |
| 4.1.2 | Name, Role, Value (A) | **A** — `aria-*`, `button-name`, `select-name`, `input-button-name` |
| 4.1.3 | Status Messages (AA) | **A** partial (live regions present) + **M** — scanner result and offline queue |

Axe does not test 2.4.11, 2.5.7, 3.3.7 or 3.3.8 at all. Those are the four criteria the 2.2 update added to this project's bar, and they are the reason the manual scripts below are part of the deliverable rather than an afterthought.

## Manual script — scanner page (`/scan`)

Run with an officer account, on a **low-end Android** (Chrome, 2 GB RAM or the closest available), an **iPhone** (Safari) and a **small screen** (320×568 emulation in DevTools) at **maximum brightness**. Use a printed student-ID barcode and a student QR.

**One-hand use**
1. Hold the phone in one hand, thumb only. Reach the event picker, the camera area, *Sync now*, the manual search field and *Find* without repositioning the grip.
2. The floating **Scan** target in the bottom nav is at least 44×44 and does not sit under the iOS home indicator or Android gesture bar.
3. No action needs a two-finger gesture, a long press or a drag. (A camera autofocus tap is the phone's, not ours.)

**Glare and outdoor use**
4. In direct sun or under a bright gym light, the **result banner** is readable at arm's length: text contrast, not colour alone (`success` green / `danger` red are paired with words).
5. The banner is announced by TalkBack/VoiceOver within ~1 s of a scan; queue counts are announced by the polite live region; the camera error uses `role="alert"`.
6. At maximum brightness, the scanner viewport still shows the camera preview and the result without scrolling.

**Small screens and the keyboard**
7. At 320×568, there is no horizontal scroll; the manual search, result banner and queue card stack without clipping.
8. With the on-screen keyboard open, the focused search field and *Find* are not hidden behind the keyboard or the bottom nav (2.4.11). Rotate to landscape and repeat.
9. At 200 % text size (Android font size / iOS larger text), labels do not overlap or clip.

**Camera and offline**
10. Deny camera permission: the page says what happened, and the manual number search still records attendance. Repeat with the camera covered.
11. Airplane mode: scan three students. The queue shows **3 waiting to sync**; reload the page; the three are still there (IndexedDB). Reconnect: all three sync, no duplicates, and the queue empties.
12. Kill the tab with a non-empty queue: reopening the page still shows the queue. (If it does not, that is BC-6 durability, not this criterion — record it.)

**Focus and targets (2.5.8 / 2.4.11)**
13. External keyboard: Tab order is event picker → camera → result → queue → *Sync now* → *discard* → manual search → *Find* → back link. No trap; Escape does not strand focus.
14. Every button is at least 24×24 px; the text links (*discard*, *clear this list*, *Back to events*) have a visible hit area. *Discard* names the student in its accessible name.
15. Focus rings are visible against both the white cards and the navy header.

**Dragging (2.5.7)**
16. On the event form's map, place the venue by tapping the map or typing latitude/longitude — no drag required. Dragging the marker is an enhancement, not the only path.

## Manual script — authentication (3.3.8) and redundant entry (3.3.7)

**3.3.8 Accessible Authentication**
1. Sign in with a password manager (Bitwarden/Chrome) — autofill works; no copy/paste is blocked.
2. Paste a password into the field — allowed.
3. No cognitive test, puzzle, CAPTCHA or memorised code is required. The email link / Supabase recovery flow is the alternative path.
4. The show-password control is reachable by keyboard, has a name (*Show password* / *Hide password*) and reports its state (`aria-pressed`).
5. A failed sign-in names the problem in text and is announced (`role="alert"` via the toast); it does not rely on a red border alone.

**3.3.7 Redundant Entry**
6. Register for an event while signed in: name/student number/college are not asked again.
7. File an excuse: the fine, event and student are already known and are not re-entered.
8. Request a clearance after paying: the covered fines are not re-selected.
9. If information must be re-entered for a legal/financial step, it is auto-populated or selectable — record any exception here.

**2.4.11 Focus Not Obscured**
10. With the page scrolled, Tab through the dashboard, event form, scanner and fines pages. The focused control is never fully covered by the sticky header or the bottom nav. At 400 % zoom, repeat.

## Scanner bundle audit (low-end Android)

`check-scanner-bundle.mjs` walks a production build, finds the chunk that actually contains `html5-qrcode`/ZXing, and fails if any chunk imports it **statically**. It also prints raw/gzip sizes for the scanner chunks, the chunks that call the scanner, and the five largest JS chunks.

```bash
npm run build
node tools/a11y/check-scanner-bundle.mjs
```

The camera library is loaded only from `app/utils/scanner-engine.ts` via `await import('html5-qrcode')`, so the event picker, manual number search and offline queue render before (and without) the ~360 KB camera script. The 2.5.7 map alternative and the manual search are what make the scanner usable when the camera never loads at all.

## Known gaps / deferred

- **Authenticated CI** needs `A11Y_EMAIL` / `A11Y_PASSWORD` (see above).
- **Manager pages** not in the route list (listed above) still have unlabelled filter/select controls. They are the next slice; adding them before fixing them would make the gate permanently red.
- **Page titles** are still the single site title for every portal route (2.4.2 is technically met, but it is poor wayfinding). Deferred to a routing/meta slice.
- **Focus trap and Escape** for the account-settings modal are partial: Escape closes it, but focus is not trapped. Manual finding; fix with a dialog primitive.
- **PDF/email artefacts** (clearance PDF, exported reports) are outside this browser gate.
- **The frozen public site** is out of scope by policy, not by omission.

## Self-check

The gate is only useful if it fails when it should. To prove a regression is caught:

```bash
# in app/pages/scan.vue, temporarily remove the label from #scan-search, or
# give a button class="h-4 w-4", then:
npm test
```

Expect `label` (serious) or the 2.5.8 assertion to fail. Revert before committing.
