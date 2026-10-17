import { test, expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

/**
 * Every public page of https://usc.syntaxure.dev at the time the rebuild started.
 * The rebuilt site must serve each of these at the SAME path and look/read the same.
 * Adding a route here is fine; removing one needs Jeff's approval.
 */
export const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/officers',
  '/projects',
  '/events',
  '/events/pag-abi-abi/photobooth',
  '/campus-guide',
  '/contact',
  '/privacy',
  '/portal',
  '/portal/features',
  '/portal/how-it-works',
  '/portal/security',
  '/portal/faq',
]

const BASELINE = (process.env.BASELINE_URL ?? 'https://usc.syntaxure.dev').replace(/\/+$/, '')
const CANDIDATE = (process.env.CANDIDATE_URL ?? '').replace(/\/+$/, '')
const MAX_DIFF = Number(process.env.MAX_DIFF ?? '0.0005') // 0.05%: live-vs-live noise is 0% once animations are masked
const FIXED_TIME = new Date('2026-10-17T02:00:00Z') // freezes clocks, countdowns and carousels

/** Elements that are legitimately non-deterministic (media frames, map tiles, embeds). */
// Animated GIFs (e.g. the spinning USC seal on the home page) can't be frozen; their presence is still
// verified by the content outline (alt text).
const MASK = ['video', 'iframe', '.leaflet-container', 'img[src$=".gif"]', 'img[src*="/gif/"]', '[data-parity-ignore]']

const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
`

function contextOptions(url: string): BrowserContextOptions {
  const bypass = process.env.VERCEL_BYPASS
  if (bypass && url.includes('.vercel.app')) {
    return { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' } }
  }
  return {}
}

async function open(
  browser: Browser,
  role: 'baseline' | 'candidate',
  base: string,
  route: string,
  viewport: { width: number; height: number }
) {
  const context = await browser.newContext({ ...contextOptions(base), viewport, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.clock.install({ time: FIXED_TIME })
  const res = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.addStyleTag({ content: FREEZE_CSS })
  // Self-test only: PARITY_FAULT_CSS is injected into the CANDIDATE to prove the gate catches changes.
  if (role === 'candidate' && process.env.PARITY_FAULT_CSS) await page.addStyleTag({ content: process.env.PARITY_FAULT_CSS })
  if (role === 'candidate' && process.env.PARITY_FAULT_TEXT) {
    await page.evaluate((t) => { const h = document.querySelector('h1, h2'); if (h) h.textContent = t }, process.env.PARITY_FAULT_TEXT)
  }
  await page.evaluate(() => document.fonts.ready)
  // Scroll through the page so lazy images and on-scroll sections render, then back to top.
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle')
  return { context, page, status: res?.status() ?? 0 }
}

async function shot(page: Page) {
  const buf = await page.screenshot({ fullPage: true, mask: MASK.map((s) => page.locator(s)), animations: 'disabled' })
  return PNG.sync.read(buf)
}

/** Readable, deterministic outline of what the page says (roles + accessible names). */
async function outline(page: Page) {
  return (await page.locator('body').ariaSnapshot()).replace(/\s+$/gm, '')
}

test.describe('public site parity', () => {
  test.skip(!CANDIDATE, 'Set CANDIDATE_URL to the build under test (see README.md)')

  for (const route of PUBLIC_ROUTES) {
    test(`${route}`, async ({ browser }, info) => {
      const viewport = info.project.use.viewport ?? { width: 1440, height: 900 }
      const a = await open(browser, 'baseline', BASELINE, route, viewport)
      const b = await open(browser, 'candidate', CANDIDATE, route, viewport)
      try {
        expect(b.status, `candidate ${route} HTTP status`).toBeLessThan(400)

        // 1) Content and structure: same headings, links, buttons, text in the same order.
        const [oa, ob] = await Promise.all([outline(a.page), outline(b.page)])
        await info.attach('outline-baseline.txt', { body: oa, contentType: 'text/plain' })
        await info.attach('outline-candidate.txt', { body: ob, contentType: 'text/plain' })
        expect(ob, `content/structure of ${route} differs from the live site`).toBe(oa)

        // 2) Pixels: full-page screenshots must match within MAX_DIFF.
        const [ia, ib] = await Promise.all([shot(a.page), shot(b.page)])
        await info.attach('baseline.png', { body: PNG.sync.write(ia), contentType: 'image/png' })
        await info.attach('candidate.png', { body: PNG.sync.write(ib), contentType: 'image/png' })
        expect(Math.abs(ia.height - ib.height), `page height differs (${ia.height}px live vs ${ib.height}px candidate)`).toBeLessThanOrEqual(2)

        const width = Math.min(ia.width, ib.width)
        const height = Math.min(ia.height, ib.height)
        const crop = (img: PNG) => {
          const out = new PNG({ width, height })
          PNG.bitblt(img, out, 0, 0, width, height, 0, 0)
          return out
        }
        const ca = crop(ia)
        const cb = crop(ib)
        const diff = new PNG({ width, height })
        const changed = pixelmatch(ca.data, cb.data, diff.data, width, height, { threshold: 0.1 })
        const ratio = changed / (width * height)
        await info.attach('diff.png', { body: PNG.sync.write(diff), contentType: 'image/png' })
        expect(ratio, `${(ratio * 100).toFixed(2)}% of pixels differ on ${route} (max ${(MAX_DIFF * 100).toFixed(2)}%)`).toBeLessThanOrEqual(MAX_DIFF)
      } finally {
        await a.context.close()
        await b.context.close()
      }
    })
  }
})
