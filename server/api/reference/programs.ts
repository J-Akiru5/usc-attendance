import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { normalizeAcademicCode, normalizeAcademicName, parseYearLevels } from '../../utils/academic'
import { requireSettingsManager } from '../../utils/retention'

// ---------------------------------------------------------------------------
// /api/reference/programs — academic reference data (settings managers only)
//   POST   { collegeId, code, name, yearLevels? }
//   PATCH  { id, code?, name?, yearLevels?, archived? }
//   DELETE { id } — only when no students reference it
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const actor = await authenticate(event)
  requireSettingsManager(actor)

  const method = getMethod(event)

  if (method === 'POST') {
    const body = await readJsonBody(event) ?? {}
    const collegeId = typeof body.collegeId === 'string' ? body.collegeId : ''
    if (!collegeId) throw badRequest('collegeId is required')

    const college = await prisma.college.findUnique({ where: { id: collegeId } })
    if (!college) throw notFound('College not found')
    if (college.archived) throw badRequest('That college is archived')

    const code = normalizeAcademicCode(body.code, 'Program code')
    const name = normalizeAcademicName(body.name, 'Program name')
    const yearLevels = parseYearLevels(body.yearLevels)

    try {
      const created = await prisma.program.create({ data: { collegeId, code, name, yearLevels } })
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'program_added',
          details: JSON.stringify({ id: created.id, collegeId, code, name, yearLevels }),
          performedBy: actor.id
        }
      })
      return respond(event, 201, created)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'That program code already exists in this college')
      throw err
    }
  }

  if (method === 'PATCH') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('Program id is required')

    const existing = await prisma.program.findUnique({ where: { id } })
    if (!existing) throw notFound('Program not found')

    const data: { collegeId?: string, code?: string, name?: string, yearLevels?: number, archived?: boolean } = {}
    if (body.collegeId !== undefined) {
      const collegeId = typeof body.collegeId === 'string' ? body.collegeId : ''
      const college = collegeId ? await prisma.college.findUnique({ where: { id: collegeId } }) : null
      if (!college) throw notFound('College not found')
      data.collegeId = college.id
    }
    if (body.code !== undefined) data.code = normalizeAcademicCode(body.code, 'Program code')
    if (body.name !== undefined) data.name = normalizeAcademicName(body.name, 'Program name')
    if (body.yearLevels !== undefined) {
      const yearLevels = parseYearLevels(body.yearLevels)
      // Shrinking below the highest year level that students currently occupy
      // would orphan them, so refuse it.
      const highest = await prisma.studentProfile.findFirst({
        where: { programId: id, yearLevel: { gt: yearLevels } },
        select: { userId: true, yearLevel: true }
      })
      if (highest) throw new HttpError(409, `A student is already in year ${highest.yearLevel} of this program`)
      data.yearLevels = yearLevels
    }
    if (body.archived !== undefined) data.archived = body.archived === true

    try {
      const updated = await prisma.program.update({ where: { id }, data })
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'program_updated',
          details: JSON.stringify({ id, changes: data }),
          performedBy: actor.id
        }
      })
      return updated
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'That program code already exists in this college')
      throw err
    }
  }

  if (method === 'DELETE') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('Program id is required')

    const existing = await prisma.program.findUnique({
      where: { id },
      include: { _count: { select: { sections: true, students: true } } }
    })
    if (!existing) throw notFound('Program not found')
    if (existing._count.students > 0) {
      throw new HttpError(409, 'Students are still in this program — archive it instead')
    }
    if (existing._count.sections > 0) {
      throw new HttpError(409, 'This program still has sections — archive or delete them first')
    }

    await prisma.program.delete({ where: { id } })
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'program_deleted',
        details: JSON.stringify({ id, code: existing.code, name: existing.name }),
        performedBy: actor.id
      }
    })
    return { deleted: true }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
