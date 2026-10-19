import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { H3Event } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  auditContext,
  auditDetails,
  auditRead,
  auditWrite,
  hashIp,
  normalizeIp,
  requestIdFrom,
  type AuditDb,
  type AuditRow
} from '../../server/utils/audit'

const SALT = 'unit-test-salt'
const originalSalt = process.env.AUDIT_IP_SALT

afterEach(() => {
  if (originalSalt === undefined) delete process.env.AUDIT_IP_SALT
  else process.env.AUDIT_IP_SALT = originalSalt
})

function recorder(): { db: AuditDb, rows: AuditRow[] } {
  const rows: AuditRow[] = []
  return {
    rows,
    db: {
      auditLog: {
        create: async ({ data }) => {
          rows.push(data)
          return data
        }
      }
    }
  }
}

describe('hashIp', () => {
  it('is a salted SHA-256 hex digest', () => {
    const hash = hashIp('203.0.113.7', SALT)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashIp('203.0.113.7', SALT))
  })

  it('changes with the salt and with the address', () => {
    const base = hashIp('203.0.113.7', SALT)
    expect(hashIp('203.0.113.7', 'another-salt')).not.toBe(base)
    expect(hashIp('203.0.113.8', SALT)).not.toBe(base)
  })

  it('never contains the address', () => {
    expect(hashIp('203.0.113.7', SALT)).not.toContain('203.0.113.7')
  })

  it('refuses to hash without a salt — an unsalted IPv4 digest is reversible', () => {
    expect(hashIp('203.0.113.7', '')).toBeNull()
    expect(hashIp('203.0.113.7', undefined)).toBeNull()
    expect(hashIp('', SALT)).toBeNull()
  })

  it('takes the first x-forwarded-for hop and unwraps IPv4-mapped IPv6', () => {
    expect(normalizeIp('198.51.100.9, 10.0.0.1')).toBe('198.51.100.9')
    expect(normalizeIp('::ffff:198.51.100.9')).toBe('198.51.100.9')
    expect(hashIp('::ffff:198.51.100.9', SALT)).toBe(hashIp('198.51.100.9', SALT))
  })
})

describe('auditDetails', () => {
  it('keeps JSON strings and serialises objects', () => {
    expect(auditDetails('{"already":"json"}')).toBe('{"already":"json"}')
    expect(auditDetails({ fineId: 'f1', amountCentavos: 5000 })).toBe('{"fineId":"f1","amountCentavos":5000}')
    expect(auditDetails(undefined)).toBeNull()
    expect(auditDetails(null)).toBeNull()
  })
})

describe('requestIdFrom', () => {
  it('accepts a proxy uuid and a generated one', () => {
    expect(requestIdFrom('3f0c2a2e-8a1f-4c1d-9c2f-7f8a9b0c1d2e')).toBe('3f0c2a2e-8a1f-4c1d-9c2f-7f8a9b0c1d2e')
    expect(requestIdFrom('abc12345')).toBe('abc12345')
  })

  it('drops anything that is not a request id', () => {
    expect(requestIdFrom('short')).toBeNull()
    expect(requestIdFrom('has spaces in it')).toBeNull()
    expect(requestIdFrom('<script>alert(1)</script>')).toBeNull()
    expect(requestIdFrom(null)).toBeNull()
  })
})

describe('auditContext', () => {
  function fakeEvent(headers: Record<string, string>, remoteAddress = '198.51.100.4'): H3Event {
    return { context: {}, node: { req: { headers, socket: { remoteAddress } } } } as unknown as H3Event
  }

  it('keeps a proxy request id and reuses one id per request', () => {
    const event = fakeEvent({ 'x-request-id': 'req-abcdef12' })
    const first = auditContext(event)
    expect(first.requestId).toBe('req-abcdef12')
    expect(first.ip).toBe('198.51.100.4')
    expect(auditContext(event)).toBe(first)
  })

  it('generates a distinct id per request when the proxy sends none', () => {
    const a = auditContext(fakeEvent({}))
    const b = auditContext(fakeEvent({}))
    expect(a.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(a.requestId).not.toBe(b.requestId)
  })
})

describe('auditWrite', () => {
  it('records the target, the actor and the request', async () => {
    process.env.AUDIT_IP_SALT = SALT
    const { db, rows } = recorder()

    await auditWrite(db, {
      actor: { id: 'treasurer-1', role: 'treasurer' },
      action: 'payment_recorded',
      targetType: 'fine',
      targetId: 'fine-1',
      userId: 'student-1',
      details: { amountCentavos: 5000 },
      requestId: 'req-abcdef12',
      ip: '203.0.113.7'
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: 'student-1',
      action: 'payment_recorded',
      performedBy: 'treasurer-1',
      targetType: 'fine',
      targetId: 'fine-1',
      actorRole: 'treasurer',
      ipHash: hashIp('203.0.113.7', SALT),
      requestId: 'req-abcdef12'
    })
    expect(rows[0]!.details).toBe('{"amountCentavos":5000}')
  })

  it('defaults the subject to the target when the target is a student', async () => {
    process.env.AUDIT_IP_SALT = SALT
    const { db, rows } = recorder()

    await auditWrite(db, {
      actor: { id: 'staff-1', role: 'staff' },
      action: 'student_updated',
      targetType: 'student',
      targetId: 'student-9'
    })

    expect(rows[0]!.userId).toBe('student-9')
  })

  it('stores no IP at all when the salt is missing', async () => {
    delete process.env.AUDIT_IP_SALT
    const { db, rows } = recorder()
    const raw = '203.0.113.7'

    await auditWrite(db, {
      actor: { id: 'staff-1', role: 'staff' },
      action: 'document_filed',
      targetType: 'document',
      targetId: 'doc-1',
      ip: raw
    })

    expect(rows[0]!.ipHash).toBeNull()
    expect(JSON.stringify(rows[0])).not.toContain(raw)
  })

  it('keeps a system action without an actor', async () => {
    const { db, rows } = recorder()
    await auditWrite(db, {
      actor: null,
      action: 'fines_generated',
      targetType: 'event',
      targetId: 'event-1'
    })
    expect(rows[0]!.performedBy).toBeNull()
    expect(rows[0]!.actorRole).toBeNull()
  })

  it('refuses an entry with no action', async () => {
    const { db } = recorder()
    await expect(auditWrite(db, { actor: null, action: '  ' })).rejects.toThrow(/action/i)
  })
})

describe('auditRead', () => {
  it('needs a target to be worth recording', async () => {
    const { db } = recorder()
    await expect(auditRead(db, { actor: null, targetType: 'student', targetId: '' })).rejects.toThrow(/target/i)
    await expect(auditRead(db, { actor: null, targetType: '', targetId: 'student-1' })).rejects.toThrow(/target/i)
  })

  it('defaults to a read_<target> action and records the reader', async () => {
    const { db, rows } = recorder()
    await auditRead(db, {
      actor: { id: 'staff-1', role: 'staff' },
      targetType: 'student',
      targetId: 'student-1',
      details: { surface: 'student360' }
    })
    expect(rows[0]).toMatchObject({
      action: 'read_student',
      targetType: 'student',
      targetId: 'student-1',
      userId: 'student-1',
      performedBy: 'staff-1',
      actorRole: 'staff'
    })
  })
})

describe('append-only guard', () => {
  const serverDir = fileURLToPath(new URL('../../server', import.meta.url))

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return sources(path)
      return entry.name.endsWith('.ts') ? [path] : []
    })
  }

  it('finds the server sources (the scan is not vacuous)', () => {
    expect(sources(serverDir).length).toBeGreaterThan(50)
  })

  it('has no code path that updates or deletes an audit row', () => {
    const forbidden = [
      { label: 'a Prisma update/delete on auditLog', pattern: /\bauditLog\.(update|delete|upsert)/ },
      { label: 'raw UPDATE audit_logs', pattern: /\bUPDATE\s+"?audit_logs"?/i },
      { label: 'raw DELETE FROM audit_logs', pattern: /\bDELETE\s+FROM\s+"?audit_logs"?/i }
    ]

    const violations: string[] = []
    for (const file of sources(serverDir)) {
      const text = readFileSync(file, 'utf8')
      for (const rule of forbidden) {
        if (rule.pattern.test(text)) violations.push(`${file}: ${rule.label}`)
      }
    }

    expect(violations).toEqual([])
  })
})
