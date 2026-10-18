import { describe, expect, it } from 'vitest'
import {
  CAPABILITIES,
  capabilitiesFromFlags,
  hasCapability,
  mergeCapabilities,
  requireCapability,
  rolesFromFlags,
  type Capability
} from '../../server/utils/rbac'
import { HttpError } from '../../server/utils/http'

const none = { canDelegate: false, canConfigure: false, canManageContent: false }

describe('capabilitiesFromFlags', () => {
  it('gives the super admin every capability', () => {
    const caps = capabilitiesFromFlags({ role: 'super_admin', ...none })
    expect(caps.sort()).toEqual([...CAPABILITIES].sort())
  })

  it('gives staff the legacy requireStaff surface only', () => {
    const caps = capabilitiesFromFlags({ role: 'staff', ...none })
    expect(caps).toContain('staff.access')
    expect(caps).toContain('attendance.record')
    expect(caps).not.toContain('admin.users')
    expect(caps).not.toContain('settings.manage')
    expect(caps).not.toContain('delegation.grant')
  })

  it('gives clients and students nothing beyond their own flows', () => {
    expect(capabilitiesFromFlags({ role: 'client', ...none })).toEqual([])
    expect(capabilitiesFromFlags({ role: 'student', ...none })).toEqual([])
  })

  it('maps canDelegate to delegation.grant + settings.manage (as the server already allowed)', () => {
    const caps = capabilitiesFromFlags({ role: 'client', ...none, canDelegate: true })
    expect(caps).toContain('delegation.grant')
    expect(caps).toContain('settings.manage')
  })

  it('maps canConfigure and canManageContent', () => {
    expect(capabilitiesFromFlags({ role: 'staff', ...none, canConfigure: true })).toContain('settings.manage')
    expect(capabilitiesFromFlags({ role: 'staff', ...none, canManageContent: true })).toContain('content.manage')
  })

  it('never grants a capability twice', () => {
    const caps = capabilitiesFromFlags({ role: 'staff', ...none, canDelegate: true, canConfigure: true })
    expect(new Set(caps).size).toBe(caps.length)
  })
})

describe('mergeCapabilities', () => {
  it('unions role-derived capabilities with the flags', () => {
    const fromRoles: Capability[] = ['content.manage']
    const merged = mergeCapabilities(fromRoles, { role: 'staff', ...none, canDelegate: true })
    expect(merged).toContain('content.manage')
    expect(merged).toContain('delegation.grant')
    expect(merged).toContain('staff.access')
  })

  it('is deduplicated', () => {
    const merged = mergeCapabilities(['staff.access'], { role: 'staff', ...none })
    expect(merged.filter(c => c === 'staff.access')).toHaveLength(1)
  })
})

describe('hasCapability / requireCapability', () => {
  it('admin.all covers every capability', () => {
    expect(hasCapability(['admin.all'], 'students.manage')).toBe(true)
    expect(hasCapability(['admin.all'], 'settings.manage')).toBe(true)
  })

  it('an ordinary list only covers what it contains', () => {
    expect(hasCapability(['staff.access'], 'admin.users')).toBe(false)
  })

  it('throws 403 without the capability and passes with it', () => {
    expect(() => requireCapability({ capabilities: ['staff.access'] }, 'admin.users')).toThrow(HttpError)
    try {
      requireCapability({ capabilities: ['staff.access'] }, 'admin.users')
    } catch (err) {
      expect((err as HttpError).status).toBe(403)
      expect((err as HttpError).message).toContain('admin.users')
    }
    expect(() => requireCapability({ capabilities: ['staff.access'] }, 'staff.access')).not.toThrow()
  })

  it('refuses when the caller has no capability context at all', () => {
    expect(() => requireCapability({}, 'staff.access')).toThrow(HttpError)
  })
})

describe('rolesFromFlags', () => {
  it('lists the mirror roles a set of flags implies', () => {
    expect(rolesFromFlags({ canDelegate: true, canConfigure: false, canManageContent: true }).sort())
      .toEqual(['content_manager', 'delegator'])
    expect(rolesFromFlags({ canDelegate: false, canConfigure: false, canManageContent: false })).toEqual([])
  })
})
