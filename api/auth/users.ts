import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    if (req.method === 'GET') {
      requireStaff(user)

      const users = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, email: true, name: true, position: true, role: true },
        orderBy: { name: 'asc' },
      })

      return res.status(200).json(users)
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
