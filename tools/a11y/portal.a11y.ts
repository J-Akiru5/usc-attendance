import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { AUTH_STATE } from './global-setup'

/**
 * Portal accessibility gate — WCAG 2.2 AA (BC-13).
 *
 * What is asserted automatically:
 *   - axe-core, restricted to the WCAG 2.0/2.1/2.2 A + AA tags, with
 *     serious/critical findings failing the build (moderate/minor are reported
 *     for triage but do not fail — see README for the rationale);
 *   - exactly one `main` landmark per route;
 *   - a skip link that is the first link, moves focus to `main`, and only
 *     appears when focused (2.4.1 / 2.4.7 / 2.4.11);
 *   - a 24×24 px target-size heuristic on buttons, selects, file/checkbox/radio
 *     inputs and block-level links (2.5.8; inline links are exempt).
 *
 * Dragging, focus-not-obscured, redundant entry and accessible authentication
 * are manual — the checklist and the scanner script live in README.md.
 */

interface PortalRoute {
  path: string
  /** Optional interaction that reveals a form/state worth scanning. */
  prepare?: (page: Page) => Promise<void>
}

const SIGNED_OUT_ROUTES: PortalRoute[] = [
  { path: '/login' },
  { path: '/reset-password' },
  { path: '/register' }
]

const SIGNED_IN_ROUTES: PortalRoute[] = [
  { path: '/dashboard' },
  {
    path: '/manage/events',
    prepare: async (page) => {
      const create = page.getByRole('button', { name: /create event/i }).first()
      if (await create.isVisible().catch(() => false)) await create.click()
    }
  },
  {
    path: '/scan',
    // Give the lazy camera chunk a beat: the result live region only exists
    // after the import resolves (or the permission error is caught).
    prepare: async (page) => {
      await page.waitForTimeout(1000)
    }
  },
  {
    path: '/fines',
    prepare: async (page) => {
      const file = page.getByRole('button', { name: /file an excuse/i }).first()
      if (await file.isVisible().catch(() => false)) await file.click()
    }
  },
  { path: '/manage/fines' },
  { path: '/notifications' },
  { path: '/check-in' },
  { path: '/qr' },
  { path: '/duty' },
  { path: '/change-password' }
]

const hasCredentials = Boolean(process.env.A11Y_EMAIL && process.env.A11Y_PASSWORD)

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  // Freeze motion so nothing is mid-transition when boxes are measured.
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
  })
  await page.waitForTimeout(250)
}

function describeViolation(violation: {
  id: string
  impact?: string | null
  help: string
  nodes: Array<{ target: Array<string | number> }>
}): string {
  const targets = violation.nodes
    .slice(0, 4)
    .map(node => `    ${node.target.join(' ')}`)
    .join('\n')
  return `  ${violation.id} (${violation.impact ?? 'unknown'}) — ${violation.help}\n${targets}`
}

/**
 * 2.5.8 Target Size (Minimum), heuristic. The full criterion has exceptions
 * (inline links, spacing, essential controls); this catches the ordinary
 * regression: a 16 px icon button or a text-only action with no hit area.
 */
async function targetSizeOffenders(page: Page) {
  return page.evaluate(() => {
    const MIN = 24
    const selector = [
      'button',
      'select',
      '[role="button"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
      'input[type="file"]',
      'a[href]'
    ].join(',')
    const text = (el: Element) => (el.getAttribute('aria-label') || el.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 64)

    return Array.from(document.querySelectorAll(selector)).flatMap((el) => {
      if (el.closest('[aria-hidden="true"]')) return []
      if ((el as HTMLButtonElement).disabled) return []
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return []
      // Inline links are exempt from 2.5.8.
      if (el.tagName === 'A' && style.display === 'inline') return []

      // A wrapping <label> is part of the checkbox/radio hit area.
      let measured: Element = el
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        const label = el.closest('label')
        if (label) measured = label
      }

      const rect = measured.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return []
      if (rect.width >= MIN && rect.height >= MIN) return []
      return [{
        tag: el.tagName.toLowerCase(),
        name: text(el),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }]
    })
  })
}

async function assertStructure(page: Page, route: string) {
  await expect(page.locator('main'), `${route} must have exactly one <main> landmark`).toHaveCount(1)

  const lang = await page.locator('html').getAttribute('lang')
  expect(lang, `${route} must declare the page language`).toBe('en')

  const small = await targetSizeOffenders(page)
  expect(
    small,
    `${route} has targets below the 24×24 CSS px minimum (WCAG 2.5.8):\n${JSON.stringify(small, null, 2)}`
  ).toEqual([])
}

async function scanRoute(page: Page, route: PortalRoute) {
  await page.goto(route.path, { waitUntil: 'domcontentloaded' })
  const landed = new URL(page.url()).pathname
  expect(
    landed,
    `${route.path} redirected to ${landed}; the seeded session is missing or lacks the role this route needs.`
  ).toBe(route.path)
  await settle(page)
  if (route.prepare) {
    await route.prepare(page)
    await page.waitForTimeout(250)
  }

  await assertStructure(page, route.path)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  const blocking = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  test.info().annotations.push({
    type: 'axe',
    description: `${route.path}: ${results.violations.length} violation(s), ${blocking.length} serious/critical`
  })

  if (blocking.length > 0) {
    await test.info().attach(`axe-${route.path.replace(/\W+/g, '-')}.json`, {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json'
    })
  }

  expect(
    blocking,
    `${route.path} has serious/critical axe violations (WCAG 2.2 AA):\n${blocking.map(describeViolation).join('\n')}`
  ).toEqual([])
}

test.describe('signed-out portal screens', () => {
  for (const route of SIGNED_OUT_ROUTES) {
    test(`${route.path} has no serious or critical violations`, async ({ page }) => {
      await scanRoute(page, route)
    })
  }
})

test.describe('signed-in portal screens', () => {
  test.skip(
    !hasCredentials,
    'Set A11Y_EMAIL and A11Y_PASSWORD (seeded staff account) to scan the authenticated portal.'
  )
  test.use({ storageState: AUTH_STATE })

  for (const route of SIGNED_IN_ROUTES) {
    test(`${route.path} has no serious or critical violations`, async ({ page }) => {
      await scanRoute(page, route)
    })
  }

  test('skip link is the first link and moves focus to the main landmark', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await settle(page)

    const firstHref = await page.locator('a[href]').first().getAttribute('href')
    expect(firstHref).toBe('#main-content')

    const skip = page.getByRole('link', { name: /skip to content/i })
    await expect(skip).not.toBeInViewport()
    await skip.focus()
    await expect(skip).toBeInViewport()
    await skip.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
  })
})
