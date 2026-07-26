import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff, requireSuperAdmin } from '../_lib/auth.js'

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
export async function me(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req)
    return res.status(200).json(user)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    const status = message.includes('Access denied') ? 403 : 401
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// GET/PUT /api/auth/users  (also handles PUT /api/auth/profile alias)
// ---------------------------------------------------------------------------
export async function users(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    if (req.method === 'GET') {
      requireStaff(user)

      const allUsers = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, email: true, name: true, position: true, role: true, canManageContent: true },
        orderBy: { name: 'asc' },
      })

      return res.status(200).json(allUsers)
    }

    if (req.method === 'PUT') {
      const { name, position } = req.body

      if (!name || !position) {
        return res.status(400).json({ error: 'Name and position are required' })
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { name, position },
      })

      return res.status(200).json({ user: updatedUser })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/auth/users/:id
// ---------------------------------------------------------------------------
export async function userById(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const user = await authenticate(req)

    if (req.method === 'PATCH') {
      requireSuperAdmin(user)

      const { canManageContent } = req.body
      if (typeof canManageContent !== 'boolean') {
        return res.status(400).json({ error: 'canManageContent (boolean) is required' })
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { canManageContent },
        select: { id: true, email: true, name: true, position: true, role: true, canManageContent: true },
      })

      return res.status(200).json(updated)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
