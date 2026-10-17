import { getMethod } from 'h3'
import { prisma } from '../utils/prisma'
import { authenticate, forbidStudents, requireSuperAdmin } from '../utils/auth'
import { badRequest, defineApiHandler, noContent, notFound, readJsonBody, respond } from '../utils/http'

// ---------------------------------------------------------------------------
// GET/POST/PUT/DELETE /api/duties
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  forbidStudents(user)

  if (getMethod(event) === 'GET') {
    const dutiesList = await prisma.officeDuty.findMany({
      include: {
        user: { select: { id: true, name: true, position: true, role: true } }
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }]
    })

    return dutiesList
  }

  if (getMethod(event) === 'POST') {
    requireSuperAdmin(user)

    const { userId, dayOfWeek, startTime, endTime, active } = await readJsonBody(event) ?? {}

    if (!userId || dayOfWeek === undefined || !startTime || !endTime) {
      throw badRequest('Missing required fields: userId, dayOfWeek, startTime, endTime')
    }

    const duty = await prisma.officeDuty.create({
      data: {
        userId,
        dayOfWeek: parseInt(dayOfWeek),
        startTime,
        endTime,
        active: active !== false
      },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } }
      }
    })

    return respond(event, 201, duty)
  }

  if (getMethod(event) === 'PUT') {
    requireSuperAdmin(user)

    const { id, userId, dayOfWeek, startTime, endTime, active } = await readJsonBody(event) ?? {}
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
        ...(active !== undefined && { active })
      },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } }
      }
    })

    return updated
  }

  if (getMethod(event) === 'DELETE') {
    requireSuperAdmin(user)

    const { id } = await readJsonBody(event) ?? {}
    if (!id) {
      throw badRequest('Missing duty id')
    }

    const existing = await prisma.officeDuty.findUnique({ where: { id } })
    if (!existing) {
      throw notFound('Schedule not found')
    }

    await prisma.officeDuty.delete({ where: { id } })
    return noContent(event, 204)
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
