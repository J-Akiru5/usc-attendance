import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { normalizeAcademicCode, normalizeAcademicName } from '../../utils/academic'
import { requireSettingsManager } from '../../utils/retention'

// ---------------------------------------------------------------------------
// /api/reference/colleges — academic reference data (settings managers only)
//   POST   { code, name }                       create
//   PATCH  { id, code?, name?, archived? }      update / archive / restore
//   DELETE { id }                               delete when nothing references it
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const actor = await authenticate(event)
  requireSettingsManager(actor)

  const method = getMethod(event)

  if (method === 'POST') {
    const body = await readJsonBody(event) ?? {}
    const code = normalizeAcademicCode(body.code, 'College code')
    const name = normalizeAcademicName(body.name, 'College name')
    try {
      const created = await prisma.college.create({ data: { code, name } })
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'college_added',
          details: JSON.stringify({ id: created.id, code: created.code, name: created.name }),
          performedBy: actor.id
        }
      })
      return respond(event, 201, created)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'A college with that code already exists')
      throw err
    }
  }

  if (method === 'PATCH') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('College id is required')

    const existing = await prisma.college.findUnique({ where: { id } })
    if (!existing) throw notFound('College not found')

    const data: { code?: string, name?: string, archived?: boolean } = {}
    if (body.code !== undefined) data.code = normalizeAcademicCode(body.code, 'College code')
    if (body.name !== undefined) data.name = normalizeAcademicName(body.name, 'College name')
    if (body.archived !== undefined) data.archived = body.archived === true

    try {
      const updated = await prisma.college.update({ where: { id }, data })
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'college_updated',
          details: JSON.stringify({ id, changes: data }),
          performedBy: actor.id
        }
      })
      return updated
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'A college with that code already exists')
      throw err
    }
  }

  if (method === 'DELETE') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('College id is required')

    const existing = await prisma.college.findUnique({
      where: { id },
      include: { _count: { select: { programs: true, students: true } } }
    })
    if (!existing) throw notFound('College not found')
    if (existing._count.programs > 0 || existing._count.students > 0) {
      throw new HttpError(409, 'This college is still referenced by programs or students — archive it instead')
    }

    await prisma.college.delete({ where: { id } })
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'college_deleted',
        details: JSON.stringify({ id, code: existing.code, name: existing.name }),
        performedBy: actor.id
      }
    })
    return { deleted: true }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
