import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { normalizeAcademicName, parseYearLevel } from '../../utils/academic'
import { requireSettingsManager } from '../../utils/retention'

// ---------------------------------------------------------------------------
// /api/reference/sections — academic reference data (settings managers only)
//   POST   { programId, yearLevel, name }
//   PATCH  { id, yearLevel?, name?, archived? }
//   DELETE { id } — only when no students reference it
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const actor = await authenticate(event)
  requireSettingsManager(actor)

  const method = getMethod(event)

  if (method === 'POST') {
    const body = await readJsonBody(event) ?? {}
    const programId = typeof body.programId === 'string' ? body.programId : ''
    if (!programId) throw badRequest('programId is required')

    const program = await prisma.program.findUnique({ where: { id: programId } })
    if (!program) throw notFound('Program not found')
    if (program.archived) throw badRequest('That program is archived')

    const yearLevel = parseYearLevel(body.yearLevel, program.yearLevels)
    const name = normalizeAcademicName(body.name, 'Section name', 40)

    try {
      const created = await prisma.section.create({ data: { programId, yearLevel, name } })
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'section_added',
          details: JSON.stringify({ id: created.id, programId, yearLevel, name }),
          performedBy: actor.id
        }
      })
      return respond(event, 201, created)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'That section already exists for this program and year level')
      throw err
    }
  }

  if (method === 'PATCH') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('Section id is required')

    const existing = await prisma.section.findUnique({ where: { id }, include: { program: true } })
    if (!existing) throw notFound('Section not found')

    const data: { yearLevel?: number, name?: string, archived?: boolean } = {}
    if (body.yearLevel !== undefined) data.yearLevel = parseYearLevel(body.yearLevel, existing.program.yearLevels)
    if (body.name !== undefined) data.name = normalizeAcademicName(body.name, 'Section name', 40)
    if (body.archived !== undefined) data.archived = body.archived === true

    try {
      const updated = await prisma.section.update({ where: { id }, data })
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'section_updated',
          details: JSON.stringify({ id, changes: data }),
          performedBy: actor.id
        }
      })
      return updated
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'That section already exists for this program and year level')
      throw err
    }
  }

  if (method === 'DELETE') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('Section id is required')

    const existing = await prisma.section.findUnique({
      where: { id },
      include: { _count: { select: { students: true, eventsAsAudience: true } } }
    })
    if (!existing) throw notFound('Section not found')
    if (existing._count.students > 0 || existing._count.eventsAsAudience > 0) {
      throw new HttpError(409, 'Students are still in this section, or an event expects it - archive it instead')
    }

    await prisma.section.delete({ where: { id } })
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'section_deleted',
        details: JSON.stringify({ id, name: existing.name, yearLevel: existing.yearLevel }),
        performedBy: actor.id
      }
    })
    return { deleted: true }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
