import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { requireSettingsManager } from '../../utils/retention'

/**
 * /api/reference/categories — colour-coded event categories (plan §8.2).
 * Any signed-in officer may read them (the calendar and the event form need the
 * list); settings managers add, rename, recolour, reorder, archive and — only
 * while nothing references them — delete.
 */

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function normalizeCode(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!CODE_RE.test(value)) throw badRequest('Category code must be 2 to 32 characters (a-z, 0-9, dashes)')
  return value
}

function normalizeName(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value.length < 2 || value.length > 40) throw badRequest('Category name must be 2 to 40 characters')
  return value
}

function normalizeColor(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!COLOR_RE.test(value)) throw badRequest('Colour must be a #rrggbb value')
  return value
}

function parseSortOrder(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value > 999) throw badRequest('Sort order must be 0 to 999')
  return value
}

export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const method = getMethod(event)

  if (method === 'GET') {
    return prisma.eventCategory.findMany({
      where: { archived: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, color: true, sortOrder: true }
    })
  }

  requireSettingsManager(user)

  if (method === 'POST') {
    const body = await readJsonBody(event) ?? {}
    const data = {
      code: normalizeCode(body.code),
      name: normalizeName(body.name),
      color: normalizeColor(body.color ?? '#C9A24B'),
      sortOrder: parseSortOrder(body.sortOrder)
    }
    try {
      const created = await prisma.eventCategory.create({ data })
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'event_category_added',
          details: JSON.stringify({ id: created.id, code: created.code, name: created.name }),
          performedBy: user.id
        }
      })
      return respond(event, 201, created)
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'A category with that code already exists')
      throw err
    }
  }

  if (method === 'PATCH') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('Category id is required')

    const existing = await prisma.eventCategory.findUnique({ where: { id } })
    if (!existing) throw notFound('Category not found')

    const data: { code?: string, name?: string, color?: string, sortOrder?: number, archived?: boolean } = {}
    if (body.code !== undefined) data.code = normalizeCode(body.code)
    if (body.name !== undefined) data.name = normalizeName(body.name)
    if (body.color !== undefined) data.color = normalizeColor(body.color)
    if (body.sortOrder !== undefined) data.sortOrder = parseSortOrder(body.sortOrder)
    if (body.archived !== undefined) data.archived = body.archived === true

    try {
      const updated = await prisma.eventCategory.update({ where: { id }, data })
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'event_category_updated',
          details: JSON.stringify({ id, changes: data }),
          performedBy: user.id
        }
      })
      return updated
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'A category with that code already exists')
      throw err
    }
  }

  if (method === 'DELETE') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('Category id is required')

    const existing = await prisma.eventCategory.findUnique({
      where: { id },
      include: { _count: { select: { events: true } } }
    })
    if (!existing) throw notFound('Category not found')
    if (existing._count.events > 0) {
      throw new HttpError(409, 'Events still use this category — archive it instead')
    }

    await prisma.eventCategory.delete({ where: { id } })
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'event_category_deleted',
        details: JSON.stringify({ id, code: existing.code, name: existing.name }),
        performedBy: user.id
      }
    })
    return { deleted: true }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
