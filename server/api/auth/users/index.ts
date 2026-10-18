import { getMethod } from 'h3'
import { authenticate, requireStaff } from '../../../utils/auth'
import { prisma } from '../../../utils/prisma'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'

// ---------------------------------------------------------------------------
// GET/PUT /api/auth/users  (also handles PUT /api/auth/profile alias)
// ---------------------------------------------------------------------------
export const usersHandler = defineApiHandler(async (event) => {
  const user = await authenticate(event)

  if (getMethod(event) === 'GET') {
    requireStaff(user)

    const allUsers = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        email: true,
        name: true,
        position: true,
        role: true,
        canManageContent: true,
        canDelegate: true,
        canConfigure: true,
        roles: { select: { role: { select: { key: true } } } }
      },
      orderBy: { name: 'asc' }
    })

    return allUsers
  }

  if (getMethod(event) === 'PUT') {
    if (user.role === 'student') {
      throw new HttpError(403, 'Access denied. Students cannot edit their name; contact the USC.')
    }
    const { name, position } = await readJsonBody(event) ?? {}

    if (!name || !position) {
      throw badRequest('Name and position are required')
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { name, position }
    })

    return { user: updatedUser }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})

export default usersHandler
