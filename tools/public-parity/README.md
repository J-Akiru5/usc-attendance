# Public-site parity gate

Guarantees the public USC website stays **exactly as it is** while the portal is rebuilt in Nuxt.

It opens every public page on the **live site** (baseline, built from `main`) and on the **build under test** (candidate) at the same moment, then fails if either differs:

1. **Content and structure** — the accessibility outline (headings, links, buttons, text, image alt text, in order) must be identical.
2. **Pixels** — full-page screenshots on desktop (1440×900) and mobile (Pixel 7) must match within **0.05 %** of pixels.

Clocks, countdowns and carousels are frozen, CSS animations disabled, lazy content scrolled into view. Only genuinely non-deterministic media is masked (video, iframes, map tiles, animated GIFs such as the spinning USC seal); their *presence* is still checked through the content outline.

Covered routes (14 × 2 viewports = 28 checks): `/`, `/about`, `/officers`, `/projects`, `/events`, `/events/pag-abi-abi/photobooth`, `/campus-guide`, `/contact`, `/privacy`, `/portal`, `/portal/features`, `/portal/how-it-works`, `/portal/security`, `/portal/faq`.

## Run it

```bash
cd tools/public-parity
npm ci
npx playwright install chromium        # once per machine
```

Against a local build of the new app (no Vercel login needed):

```bash
# in the repo root, in another terminal:  npm run build && npm run preview   (Nuxt → http://localhost:3000)
CANDIDATE_URL=http://localhost:3000 npx playwright test
```

Against a Vercel preview (previews are behind Vercel login). Create a bypass secret in Vercel → Project → Settings → Deployment Protection → *Protection Bypass for Automation*, then:

```bash
CANDIDATE_URL=https://usc-attendance-git-develop-j-akiru5s-projects.vercel.app VERCEL_BYPASS=<secret> npx playwright test
```

The HTML report (`report/index.html`) shows the baseline, candidate and diff image plus both content outlines for every failure.

Windows Git Bash: prefix with `MSYS_NO_PATHCONV=1` when using `--grep "/route"`.

## Self-tests (prove the gate works)

```bash
npm run parity:self-check                                               # live vs live → 28 passed
CANDIDATE_URL=https://usc.syntaxure.dev PARITY_FAULT_CSS='body{letter-spacing:0.4px}' npx playwright test   # must FAIL
CANDIDATE_URL=https://usc.syntaxure.dev PARITY_FAULT_TEXT='Changed heading' npx playwright test             # must FAIL
```

Verified 2026-10-17: self-check 28/28 pass; a 0.4 px letter-spacing change (1.79 %), a changed heading (outline mismatch), a heading colour change (0.10 %) and a Tailwind-v4-style border-colour drift (0.37 %) all fail. Known limit: changes invisible at screenshot resolution (e.g. corner radius on elements with no visible background) can stay under 0.05 %.

## Rules

- The gate must report **28 passed** against the candidate before `develop` is merged into `main` (the cutover), and on every PR into `develop` that touches public pages, layouts, global CSS or the theme.
- Don't raise `MAX_DIFF`, add masks or drop routes to make it pass; fix the page. Any intentional public-site change needs Jeff's approval first, then the baseline (the live site) changes when that approved change ships on `main`.
