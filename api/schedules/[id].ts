import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { authenticate, requireSuperAdmin } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)
    requireSuperAdmin(user)

    const { id } = req.query
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Schedule ID is required' })
    }

    if (req.method === 'PUT') {
      const { userId, dayOfWeek, startTime, endTime, active } = req.body

      const existing = await prisma.officeDuty.findUnique({ where: { id } })
      if (!existing) {
        return res.status(404).json({ error: 'Schedule not found' })
      }

      const updated = await prisma.officeDuty.update({
        where: { id },
        data: {
          ...(userId !== undefined && { userId }),
          ...(dayOfWeek !== undefined && { dayOfWeek: parseInt(dayOfWeek) }),
          ...(startTime !== undefined && { startTime }),
          ...(endTime !== undefined && { endTime }),
          ...(active !== undefined && { active }),
        },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
        },
      })

      return res.status(200).json(updated)
    }

    if (req.method === 'DELETE') {
      const existing = await prisma.officeDuty.findUnique({ where: { id } })
      if (!existing) {
        return res.status(404).json({ error: 'Schedule not found' })
      }

      await prisma.officeDuty.delete({ where: { id } })
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
