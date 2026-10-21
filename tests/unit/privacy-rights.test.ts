import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CONSENT_VERSION } from '../../server/utils/consent'
import {
  DEFAULT_ATTENDANCE_PHOTO_RETENTION_DAYS,
  MAX_ATTENDANCE_PHOTO_RETENTION_DAYS
} from '../../server/utils/attendance-photo'
import { MAX_GRACE_DAYS, MAX_RETENTION_SEMESTERS } from '../../server/utils/retention'
import { CORRECTABLE_FIELDS, CORRECTABLE_FIELD_LABELS } from '../../server/utils/privacy'

/**
 * The privacy & rights page is prose, but its retention figures are claims about
 * the code. This test keeps the prose honest: defaults come from the Prisma
 * settings, limits and photo defaults come from the same modules the purge jobs
 * import, and the rights section has to point at the account area that
 * actually builds the export and files the correction request.
 *
 * A display value is read from the page by its data attribute instead of
 * duplicating the figure here, so there is one production copy and the test
 * derives the expectation from code.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE = resolve(ROOT, 'app/pages/privacy-rights.vue')
const ACCOUNT_PAGE = resolve(ROOT, 'app/pages/account/privacy.vue')
const AUTH_LAYOUT = resolve(ROOT, 'app/layouts/auth.vue')
const A11Y_SPEC = resolve(ROOT, 'tools/a11y/portal.a11y.ts')
const SCHEMA = resolve(ROOT, 'prisma/schema.prisma')

const page = readFileSync(PAGE, 'utf8')

function displayed(name: string): string {
  const match = new RegExp(`data-retention-value="${name}"[^>]*>([^<]+)<`).exec(page)
  expect(match, `the page is missing data-retention-value="${name}"`).not.toBeNull()
  return match?.[1]?.trim() ?? ''
}

function bound(name: string): string {
  const match = new RegExp(`data-retention-bound="${name}"[^>]*>([^<]+)<`).exec(page)
  expect(match, `the page is missing data-retention-bound="${name}"`).not.toBeNull()
  return match?.[1]?.trim() ?? ''
}

function schemaDefaults(): { signatureRetentionSemesters: number, purgeGraceDays: number } {
  const schema = readFileSync(SCHEMA, 'utf8')
  const settings = /model Settings \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? ''
  const value = (field: string): number => {
    const found = new RegExp(`${field}\\s+Int\\s+@default\\((\\d+)\\)`).exec(settings)
    expect(found, `prisma/schema.prisma has no default for Settings.${field}`).not.toBeNull()
    return Number(found?.[1])
  }
  const defaults = {
    signatureRetentionSemesters: value('signatureRetentionSemesters'),
    purgeGraceDays: value('purgeGraceDays')
  }
  // A parse failure would otherwise make the page assertion vacuous.
  expect(defaults.signatureRetentionSemesters).toBeGreaterThan(0)
  expect(defaults.purgeGraceDays).toBeGreaterThanOrEqual(0)
  return defaults
}

describe('retention figures on the page match the code', () => {
  it('uses the signature default and grace period from the Settings model', () => {
    const defaults = schemaDefaults()
    const semesters = `${defaults.signatureRetentionSemesters} semester${defaults.signatureRetentionSemesters === 1 ? '' : 's'}`
    expect(displayed('signature-semesters')).toBe(semesters)
    expect(displayed('signature-grace-days')).toBe(`${defaults.purgeGraceDays} days`)
  })

  it('uses the configured signature bounds from retention.ts', () => {
    expect(bound('signature-semesters')).toBe(`1 to ${MAX_RETENTION_SEMESTERS} semesters`)
    expect(bound('signature-grace-days')).toBe(`0 to ${MAX_GRACE_DAYS} days`)
  })

  it('uses the attendance-photo default and maximum from attendance-photo.ts', () => {
    expect(displayed('photo-days')).toBe(`${DEFAULT_ATTENDANCE_PHOTO_RETENTION_DAYS} days`)
    expect(bound('photo-days')).toBe(`1 to ${MAX_ATTENDANCE_PHOTO_RETENTION_DAYS} days`)
  })

  it('labels every planned retention period as planned, never as a working control', () => {
    const rows = [...page.matchAll(/<tr data-retention-row="([^"]+)"([^>]*)>/g)]
    expect(rows.length).toBeGreaterThan(0)
    for (const [, name, attributes] of rows) {
      if (!attributes?.includes('data-retention-state="planned"')) continue
      const start = page.indexOf(`data-retention-row="${name}"`)
      const end = page.indexOf('</tr>', start)
      const row = page.slice(start, end)
      expect(
        /Plan only|Not fixed yet/.test(row),
        `planned row "${name}" must say it is not an implemented retention control`
      ).toBe(true)
      expect(
        /No automatic deletion|no job does that yet|not built/i.test(row),
        `planned row "${name}" must explain that no automatic deletion exists`
      ).toBe(true)
    }
  })

  it('does not present a plan-only location period as a number of days', () => {
    const start = page.indexOf('data-retention-row="location"')
    const end = page.indexOf('</tr>', start)
    const row = page.slice(start, end)
    expect(row).toContain('data-retention-state="planned"')
    expect(row).toContain('No automatic deletion today')
    expect(row).toContain('question C-6')
  })
})

describe('the rights section points at working code paths', () => {
  it('links access and rectification to the account page anchors', () => {
    expect(page).toContain('const EXPORT_PATH = \'/account/privacy#download\'')
    expect(page).toContain('const CORRECTION_PATH = \'/account/privacy#correction\'')
    expect(page).toContain(':to="EXPORT_PATH"')
    expect(page).toContain(':to="CORRECTION_PATH"')
  })

  it('the account page actually has both anchors and requires a signed-in account', () => {
    const account = readFileSync(ACCOUNT_PAGE, 'utf8')
    expect(account).toContain('id="download"')
    expect(account).toContain('id="correction"')
    expect(account).toContain('requiresAuth: true')
  })

  it('the export and rectification handlers exist where the account page calls them', () => {
    const account = readFileSync(ACCOUNT_PAGE, 'utf8')
    expect(account).toContain('/api/privacy/export')
    expect(account).toContain('/privacy/requests')
    expect(existsSync(resolve(ROOT, 'server/api/privacy/export.ts'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'server/api/privacy/requests/index.ts'))).toBe(true)
  })

  it('lists exactly the fields the rectification parser accepts, with the code labels', () => {
    const listed = [...page.matchAll(/data-correctable-field="([^"]+)"[^>]*>\s*([^<]+)</g)]
    expect(listed.map(([, field]) => field)).toEqual([...CORRECTABLE_FIELDS])
    for (const [, field, label] of listed) {
      expect(label?.trim()).toBe(CORRECTABLE_FIELD_LABELS[field as keyof typeof CORRECTABLE_FIELD_LABELS])
    }
  })

  it('quotes the consent notice version the register records', () => {
    const match = /data-consent-version[^>]*>\s*([^<]+)</.exec(page)
    expect(match?.[1]?.trim()).toBe(CONSENT_VERSION)
  })
})

describe('portal surfaces link to the page without touching the public site', () => {
  it('links from the account privacy page', () => {
    expect(readFileSync(ACCOUNT_PAGE, 'utf8')).toContain('to="/privacy-rights"')
  })

  it('links from the auth layout footer', () => {
    expect(readFileSync(AUTH_LAYOUT, 'utf8')).toContain('to="/privacy-rights"')
  })

  it('is in the signed-out accessibility scan list', () => {
    const a11y = readFileSync(A11Y_SPEC, 'utf8')
    const signedOut = a11y.slice(
      a11y.indexOf('const SIGNED_OUT_ROUTES'),
      a11y.indexOf('const SIGNED_IN_ROUTES')
    )
    expect(signedOut).toContain('path: \'/privacy-rights\'')
  })
})

describe('the DPO placeholder is honest', () => {
  it('is marked as a placeholder pending council decision C-4', () => {
    expect(page).toContain('data-dpo-placeholder')
    expect(page).toContain('Placeholder — council decision C-4 is unanswered')
    expect(page).toContain('not yet published')
  })

  it('does not invent an address, a name or a mailto link', () => {
    expect(page).not.toMatch(/mailto:/i)
    expect(page).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
  })
})
