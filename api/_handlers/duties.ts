import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, forbidStudents, requireSuperAdmin } from '../_lib/auth.js'
import { badRequest, handle, notFound } from '../_lib/http.js'

// ---------------------------------------------------------------------------
// GET/POST/PUT/DELETE /api/duties
// ---------------------------------------------------------------------------
export const duties = handle(async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticate(req)
  forbidStudents(user)

  if (req.method === 'GET') {
    const dutiesList = await prisma.officeDuty.findMany({
      include: {
        user: { select: { id: true, name: true, position: true, role: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })

    return res.status(200).json(dutiesList)
  }

  if (req.method === 'POST') {
    requireSuperAdmin(user)

    const { userId, dayOfWeek, startTime, endTime, active } = req.body

    if (!userId || dayOfWeek === undefined || !startTime || !endTime) {
      throw badRequest('Missing required fields: userId, dayOfWeek, startTime, endTime')
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
      throw badRequest('Schedule ID is required')
    }

    const existing = await prisma.officeDuty.findUnique({ where: { id } })
    if (!existing) {
      throw notFound('Schedule not found')
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
      throw badRequest('Missing duty id')
    }

    const existing = await prisma.officeDuty.findUnique({ where: { id } })
    if (!existing) {
      throw notFound('Schedule not found')
    }

    await prisma.officeDuty.delete({ where: { id } })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Method not allowed' })
})
