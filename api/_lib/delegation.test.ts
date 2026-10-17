import { describe, expect, it } from 'vitest'
import { HttpError } from './http.js'
import {
  computeExpiry,
  grantAllows,
  hasEventScope,
  isGrantActive,
  parseScopes,
  requireCanDelegate,
  requireEventScope,
  type DelegationDb
} from './delegation.js'

const NOW = new Date('2026-11-10T02:00:00Z') // 10:00 Manila
// Event on 2026-11-10 Manila → day ends 2026-11-10T16:00:00Z
const EVENT_DATE = new Date('2026-11-10T01:00:00Z')
const DAY_END = new Date('2026-11-10T16:00:00Z')

const staff = { id: 's1', role: 'staff' }
const client = { id: 'c1', role: 'client' }

function expectHttp(fn: () => unknown, status: number, part?: string) {
  try {
    fn()
    expect.unreachable('expected HttpError')
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(status)
    if (part) expect((err as HttpError).message).toContain(part)
  }
}

interface Grant {
  userId: string
  eventId: string
  scopes: string[]
  expiresAt: Date
  revokedAt: Date | null
}

/** Fake DB that applies the same filter the real query does. */
function fakeDb(grants: Grant[]): DelegationDb & { audit: unknown[] } {
  const audit: unknown[] = []
  return {
    audit,
    eventDelegate: {
      async findFirst({ where }) {
        const g = grants.find(
          x =>
            x.userId === where.userId
            && x.eventId === where.eventId
            && x.revokedAt === null
            && x.expiresAt.getTime() > where.expiresAt.gt.getTime()
            && x.scopes.includes(where.scopes.has)
        )
        return g ? { id: 'grant-1' } : null
      }
    },
    auditLog: {
      async create(args) {
        audit.push(args.data)
      }
    }
  }
}

const activeGrant = (over: Partial<Grant> = {}): Grant => ({
  userId: 'c1',
  eventId: 'e1',
  scopes: ['scan'],
  expiresAt: DAY_END,
  revokedAt: null,
  ...over
})

describe('parseScopes', () => {
  it('accepts known scopes and de-duplicates', () => {
    expect(parseScopes(['scan', 'export', 'scan'])).toEqual(['scan', 'export'])
  })
  it('rejects empty, non-array, and unknown scopes', () => {
    expectHttp(() => parseScopes([]), 400)
    expectHttp(() => parseScopes('scan'), 400)
    expectHttp(() => parseScopes(['scan', 'admin']), 400, 'Unknown scope')
    expectHttp(() => parseScopes([42]), 400)
  })
})

describe('computeExpiry', () => {
  it('defaults to the end of the event Manila day', () => {
    expect(computeExpiry(EVENT_DATE, undefined, NOW).toISOString()).toBe(DAY_END.toISOString())
  })
  it('refuses a default grant for an event whose day already ended', () => {
    const later = new Date('2026-11-11T00:00:00Z')
    expectHttp(() => computeExpiry(EVENT_DATE, undefined, later), 400, 'already ended')
  })
  it('accepts an explicit future expiry within the 24h grace', () => {
    const want = new Date(DAY_END.getTime() + 3_600_000)
    expect(computeExpiry(EVENT_DATE, want.toISOString(), NOW).getTime()).toBe(want.getTime())
  })
  it('rejects past, invalid, and too-distant expiries', () => {
    expectHttp(() => computeExpiry(EVENT_DATE, '2026-11-09T00:00:00Z', NOW), 400, 'future')
    expectHttp(() => computeExpiry(EVENT_DATE, 'not-a-date', NOW), 400, 'valid date')
    const far = new Date(DAY_END.getTime() + 25 * 3_600_000)
    expectHttp(() => computeExpiry(EVENT_DATE, far.toISOString(), NOW), 400, 'too far')
  })
})

describe('requireCanDelegate', () => {
  it('allows only canDelegate === true', () => {
    expect(() => requireCanDelegate({ canDelegate: true })).not.toThrow()
    expectHttp(() => requireCanDelegate({ canDelegate: false }), 403)
    expectHttp(() => requireCanDelegate({}), 403)
  })
})

describe('grant helpers', () => {
  it('isGrantActive: expired and revoked grants are inactive', () => {
    expect(isGrantActive({ expiresAt: DAY_END, revokedAt: null }, NOW)).toBe(true)
    expect(isGrantActive({ expiresAt: new Date(NOW.getTime() - 1), revokedAt: null }, NOW)).toBe(false)
    expect(isGrantActive({ expiresAt: DAY_END, revokedAt: NOW }, NOW)).toBe(false)
  })
  it('grantAllows requires matching event and scope', () => {
    const g = { eventId: 'e1', scopes: ['scan'], expiresAt: DAY_END, revokedAt: null }
    expect(grantAllows(g, 'e1', 'scan', NOW)).toBe(true)
    expect(grantAllows(g, 'e2', 'scan', NOW)).toBe(false)
    expect(grantAllows(g, 'e1', 'export', NOW)).toBe(false)
  })
})

describe('hasEventScope / requireEventScope', () => {
  it('staff always pass without a grant (existing behaviour kept)', async () => {
    const r = await hasEventScope(fakeDb([]), staff, 'e1', 'export', NOW)
    expect(r).toEqual({ allowed: true, viaDelegation: false })
  })
  it('a client with an active matching grant passes, flagged as delegated', async () => {
    const r = await hasEventScope(fakeDb([activeGrant()]), client, 'e1', 'scan', NOW)
    expect(r).toEqual({ allowed: true, viaDelegation: true })
  })
  it('a client with no grant is denied', async () => {
    const r = await hasEventScope(fakeDb([]), client, 'e1', 'scan', NOW)
    expect(r.allowed).toBe(false)
  })
  it('denies the wrong scope, wrong event, other users grant, expired and revoked', async () => {
    const db = fakeDb([
      activeGrant({ scopes: ['scan'] }),
      activeGrant({ userId: 'someone-else', scopes: ['export'] })
    ])
    expect((await hasEventScope(db, client, 'e1', 'export', NOW)).allowed).toBe(false)
    expect((await hasEventScope(db, client, 'e2', 'scan', NOW)).allowed).toBe(false)
    const expired = fakeDb([activeGrant({ expiresAt: new Date(NOW.getTime() - 1000) })])
    expect((await hasEventScope(expired, client, 'e1', 'scan', NOW)).allowed).toBe(false)
    const revoked = fakeDb([activeGrant({ revokedAt: new Date(NOW.getTime() - 1000) })])
    expect((await hasEventScope(revoked, client, 'e1', 'scan', NOW)).allowed).toBe(false)
  })
  it('requireEventScope throws 403 when denied and resolves when allowed', async () => {
    await expect(requireEventScope(fakeDb([]), client, 'e1', 'scan', NOW)).rejects.toMatchObject({
      status: 403
    })
    await expect(
      requireEventScope(fakeDb([activeGrant()]), client, 'e1', 'scan', NOW)
    ).resolves.toEqual({ viaDelegation: true })
  })
})
