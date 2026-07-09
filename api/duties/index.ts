import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireSuperAdmin } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    if (req.method === 'GET') {
      const duties = await prisma.officeDuty.findMany({
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      })

      return res.status(200).json(duties)
    }

    if (req.method === 'POST') {
      requireSuperAdmin(user)

      const { userId, dayOfWeek, startTime, endTime, active } = req.body

      if (!userId || dayOfWeek === undefined || !startTime || !endTime) {
        return res.status(400).json({ error: 'Missing required fields: userId, dayOfWeek, startTime, endTime' })
      }

      const duty = await prisma.officeDuty.create({
        data: {
          userId,
          dayOfWeek: parseInt(dayOfWeek),
          startTime,
          endTime,
          active: active !== false,
        },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
        },
      })

      return res.status(201).json(duty)
    }

    if (req.method === 'PUT') {
      requireSuperAdmin(user)

      const { id, userId, dayOfWeek, startTime, endTime, active } = req.body
      if (!id) {
        return res.status(400).json({ error: 'Schedule ID is required' })
      }

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
      requireSuperAdmin(user)

      const { id } = req.body
      if (!id) {
        return res.status(400).json({ error: 'Missing duty id' })
      }

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
