import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../../_lib/prisma.js'
import { authenticate, requireSuperAdmin } from '../../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)
    const id = req.query.id as string

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