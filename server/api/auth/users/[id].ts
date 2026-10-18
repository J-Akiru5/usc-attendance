import { getMethod, getRouterParam } from 'h3'
import { authenticate, requireSuperAdmin } from '../../../utils/auth'
import { prisma } from '../../../utils/prisma'
import { badRequest, defineApiHandler, readJsonBody, respond } from '../../../utils/http'
import { mergeCapabilities, type Capability } from '../../../utils/rbac'

/** System roles this endpoint may assign; each one mirrors a legacy flag. */
const MIRROR_ROLES = {
  delegator: 'canDelegate',
  settings_manager: 'canConfigure',
  content_manager: 'canManageContent'
} as const

type MirrorRole = keyof typeof MIRROR_ROLES

const select = {
  id: true,
  email: true,
  name: true,
  position: true,
  role: true,
  canManageContent: true,
  canDelegate: true,
  canConfigure: true,
  roles: { select: { role: { select: { key: true } } } }
} as const

// ---------------------------------------------------------------------------
// PATCH /api/auth/users/:id
//
// Accepts the legacy booleans (canManageContent / canDelegate / canConfigure)
// and/or a `roles` array of mirror roles. Both are the same thing underneath:
// granting a flag assigns its capability role, and the legacy flag is written
// back so the Vite app that is still live reads the same truth (plan §7.2).
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const id = getRouterParam(event, 'id') ?? ''

  if (getMethod(event) !== 'PATCH') {
    return respond(event, 405, { error: 'Method not allowed' })
  }
  requireSuperAdmin(user)

  const body = await readJsonBody(event) ?? {}
  const { canManageContent, canDelegate, canConfigure, roles } = body

  for (const [key, value] of [['canManageContent', canManageContent], ['canDelegate', canDelegate], ['canConfigure', canConfigure]] as const) {
    if (value !== undefined && typeof value !== 'boolean') throw badRequest(`${key} must be a boolean`)
  }

  let requestedRoles: MirrorRole[] | undefined
  if (roles !== undefined) {
    if (!Array.isArray(roles) || roles.some(r => typeof r !== 'string')) {
      throw badRequest('roles must be an array of role keys')
    }
    const unknown = (roles as string[]).filter(r => !(r in MIRROR_ROLES))
    if (unknown.length) throw badRequest(`Unknown role: ${unknown.join(', ')}`)
    requestedRoles = roles as MirrorRole[]
  }

  if (canManageContent === undefined && canDelegate === undefined && canConfigure === undefined && requestedRoles === undefined) {
    throw badRequest('canManageContent, canDelegate, canConfigure (boolean) or roles (array) is required')
  }

  const target = await prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } })
  if (!target) throw badRequest('User not found')

  // Start from what the user has today, then apply whichever form was sent.
  const current = new Set(target.roles.map(r => r.role.key))
  const desired = requestedRoles !== undefined
    ? new Set<string>(requestedRoles)
    : new Set([...current].filter(k => !(k in MIRROR_ROLES)))

  if (requestedRoles === undefined) {
    if (canDelegate !== undefined) {
      if (canDelegate) desired.add('delegator')
      else desired.delete('delegator')
    }
    if (canConfigure !== undefined) {
      if (canConfigure) desired.add('settings_manager')
      else desired.delete('settings_manager')
    }
    if (canManageContent !== undefined) {
      if (canManageContent) desired.add('content_manager')
      else desired.delete('content_manager')
    }
  }

  const allRoles = await prisma.role.findMany({ where: { key: { in: [...desired.keys()] } } })
  if (allRoles.length !== desired.size) throw badRequest('Unknown role')

  // The legacy booleans follow the capability roles, whichever form was used.
  const nextFlags = {
    canDelegate: desired.has('delegator'),
    canConfigure: desired.has('settings_manager'),
    canManageContent: desired.has('content_manager')
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: id, role: { key: { in: Object.keys(MIRROR_ROLES) } } } })
    for (const role of allRoles) {
      await tx.userRole.create({ data: { userId: id, roleId: role.id, assignedBy: user.id } })
    }
    return tx.user.update({
      where: { id },
      data: nextFlags,
      select
    })
  })

  const audit: Array<{ action: string, changed: boolean }> = [
    { action: nextFlags.canConfigure ? 'settings_access_granted' : 'settings_access_removed', changed: canConfigure !== undefined || requestedRoles !== undefined },
    { action: nextFlags.canDelegate ? 'delegate_power_granted' : 'delegate_power_removed', changed: canDelegate !== undefined || requestedRoles !== undefined },
    { action: nextFlags.canManageContent ? 'content_access_granted' : 'content_access_removed', changed: canManageContent !== undefined || requestedRoles !== undefined }
  ]
  for (const entry of audit) {
    if (!entry.changed) continue
    await prisma.auditLog.create({ data: { userId: id, action: entry.action, performedBy: user.id } })
  }

  const roleRows = await prisma.userRole.findMany({
    where: { userId: id },
    include: { role: { include: { capabilities: true } } }
  })
  const capabilities = mergeCapabilities(
    roleRows.flatMap(r => r.role.capabilities.map(c => c.capability)) as Capability[],
    { role: updated.role, ...nextFlags }
  )

  return {
    ...updated,
    roles: updated.roles.map(r => r.role.key),
    capabilities
  }
})
