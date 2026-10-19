import { HttpError } from './http'

/**
 * Capability-based RBAC (plan §7.2): one table of roles, one of role →
 * capability, and one user → role. The capabilities below are exactly the ones
 * the server enforces today — the guard helpers are thin wrappers so no route
 * had to change its behaviour when the flags became roles.
 */
export const CAPABILITIES = [
  'admin.all',
  'admin.users',
  'admin.reference',
  'settings.manage',
  'staff.access',
  'events.manage',
  'attendance.record',
  'attendance.roster',
  'attendance.export',
  'delegation.grant',
  'content.manage',
  'students.manage',
  'duties.manage',
  'photos.manage',
  // Finance (plan §8.7): the Treasurer manages the budget and holds the money,
  // the President / Adviser record their own "noted" step in-app, the Auditor
  // reads everything. The migration seeds the matching roles.
  'finance.manage',
  'finance.note',
  'finance.audit'
] as const

export type Capability = typeof CAPABILITIES[number]

/** The system roles the migration seeds; each one is a capability bundle. */
export const SYSTEM_ROLES = [
  'super_admin',
  'staff',
  'client',
  'student',
  'settings_manager',
  'delegator',
  'content_manager',
  'treasurer',
  'finance_noter',
  'auditor'
] as const

export type SystemRole = typeof SYSTEM_ROLES[number]

export interface LegacyFlags {
  role: string
  canDelegate: boolean
  canConfigure: boolean
  canManageContent: boolean
}

/**
 * Capabilities implied by the legacy role + boolean flags. Used as a fallback
 * for rows that predate the RBAC tables (and to keep the mirror honest), so the
 * live Vite app and this one always agree about who can do what.
 */
export function capabilitiesFromFlags(user: LegacyFlags): Capability[] {
  const caps = new Set<Capability>()

  if (user.role === 'super_admin') {
    return [...CAPABILITIES]
  }
  if (user.role === 'staff') {
    caps.add('staff.access')
    caps.add('events.manage')
    caps.add('attendance.record')
    caps.add('attendance.roster')
    caps.add('attendance.export')
    caps.add('duties.manage')
    caps.add('photos.manage')
  }
  if (user.canDelegate) {
    caps.add('delegation.grant')
    caps.add('settings.manage')
  }
  if (user.canConfigure) caps.add('settings.manage')
  if (user.canManageContent) caps.add('content.manage')

  return [...caps]
}

/** Union of the capabilities from a user's roles and their legacy flags. */
export function mergeCapabilities(fromRoles: Capability[], flags: LegacyFlags): Capability[] {
  return [...new Set([...fromRoles, ...capabilitiesFromFlags(flags)])]
}

export function hasCapability(capabilities: readonly string[], capability: Capability): boolean {
  return capabilities.includes('admin.all') || capabilities.includes(capability)
}

/** Guard for a route handler: throws 403 unless the user holds the capability. */
export function requireCapability(user: { capabilities?: readonly string[] }, capability: Capability) {
  if (!user.capabilities) {
    throw new HttpError(403, 'Access denied. Missing capability context.')
  }
  if (!hasCapability(user.capabilities, capability)) {
    throw new HttpError(403, `Access denied. Required capability: ${capability}`)
  }
}

/** The same, for a route any one of several capabilities may open. */
export function requireAnyCapability(user: { capabilities?: readonly string[] }, capabilities: readonly Capability[]) {
  if (!user.capabilities) {
    throw new HttpError(403, 'Access denied. Missing capability context.')
  }
  if (!capabilities.some(capability => hasCapability(user.capabilities!, capability))) {
    throw new HttpError(403, `Access denied. Required capability: ${capabilities.join(' or ')}`)
  }
}

/**
 * Roles a set of legacy flags should imply, so the admin UI can express the old
 * boolean toggles as role assignments without ever drifting from the mirrored
 * columns.
 */
export function rolesFromFlags(flags: Pick<LegacyFlags, 'canDelegate' | 'canConfigure' | 'canManageContent'>): SystemRole[] {
  const roles: SystemRole[] = []
  if (flags.canDelegate) roles.push('delegator')
  if (flags.canConfigure) roles.push('settings_manager')
  if (flags.canManageContent) roles.push('content_manager')
  return roles
}
