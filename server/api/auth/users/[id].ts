import { getMethod, getRouterParam } from 'h3'
import { authenticate, requireSuperAdmin } from '../../../utils/auth'
import { prisma } from '../../../utils/prisma'
import { badRequest, defineApiHandler, readJsonBody, respond } from '../../../utils/http'

// ---------------------------------------------------------------------------
// PATCH /api/auth/users/:id
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const id = getRouterParam(event, 'id') ?? ''

  if (getMethod(event) === 'PATCH') {
    requireSuperAdmin(user)

    const { canManageContent, canDelegate, canConfigure } = await readJsonBody(event) ?? {}
    if (canManageContent !== undefined && typeof canManageContent !== 'boolean') {
      throw badRequest('canManageContent must be a boolean')
    }
    if (canDelegate !== undefined && typeof canDelegate !== 'boolean') {
      throw badRequest('canDelegate must be a boolean')
    }
    if (canConfigure !== undefined && typeof canConfigure !== 'boolean') {
      throw badRequest('canConfigure must be a boolean')
    }
    if (canManageContent === undefined && canDelegate === undefined && canConfigure === undefined) {
      throw badRequest('canManageContent, canDelegate or canConfigure (boolean) is required')
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(canManageContent !== undefined && { canManageContent }),
        ...(canDelegate !== undefined && { canDelegate }),
        ...(canConfigure !== undefined && { canConfigure })
      },
      select: { id: true, email: true, name: true, position: true, role: true, canManageContent: true, canDelegate: true, canConfigure: true }
    })

    if (canConfigure !== undefined) {
      await prisma.auditLog.create({
        data: {
          userId: id,
          action: canConfigure ? 'settings_access_granted' : 'settings_access_removed',
          performedBy: user.id
        }
      })
    }

    if (canDelegate !== undefined) {
      await prisma.auditLog.create({
        data: {
          userId: id,
          action: canDelegate ? 'delegate_power_granted' : 'delegate_power_removed',
          performedBy: user.id
        }
      })
    }

    return updated
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
