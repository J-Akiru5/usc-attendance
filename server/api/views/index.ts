import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'

/**
 * /api/views — saved table views (plan §8.1, useDataTable). Personal to the
 * caller: one row per user + resource + name, storing the query string the
 * table puts in the URL.
 */

const RESOURCE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/

function normalizeResource(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!RESOURCE_RE.test(value)) throw badRequest('Invalid resource name')
  return value
}

function normalizeName(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value.length < 1 || value.length > 60) throw badRequest('View name must be 1 to 60 characters')
  return value
}

/** The query string as the table would put it in the URL. */
function normalizeQuery(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().replace(/^[?&]+/, '') : ''
  if (value.length > 500) throw badRequest('View query is too long')
  return value
}

export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const method = getMethod(event)

  if (method === 'GET') {
    const resource = normalizeResource(getQuery(event).resource)
    return prisma.savedView.findMany({
      where: { userId: user.id, resource },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, query: true, updatedAt: true }
    })
  }

  if (method === 'POST') {
    const body = await readJsonBody(event) ?? {}
    const resource = normalizeResource(body.resource)
    const name = normalizeName(body.name)
    const query = normalizeQuery(body.query)
    try {
      const created = await prisma.savedView.create({
        data: { userId: user.id, resource, name, query }
      })
      return respond(event, 201, { id: created.id, name: created.name, query: created.query })
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'You already have a view with that name')
      throw err
    }
  }

  if (method === 'PATCH') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('View id is required')

    const existing = await prisma.savedView.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) throw notFound('View not found')

    const data: { name?: string, query?: string, updatedAt: Date } = { updatedAt: new Date() }
    if (body.name !== undefined) data.name = normalizeName(body.name)
    if (body.query !== undefined) data.query = normalizeQuery(body.query)

    try {
      const updated = await prisma.savedView.update({ where: { id }, data })
      return { id: updated.id, name: updated.name, query: updated.query }
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'You already have a view with that name')
      throw err
    }
  }

  if (method === 'DELETE') {
    const body = await readJsonBody(event) ?? {}
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) throw badRequest('View id is required')

    const existing = await prisma.savedView.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) throw notFound('View not found')

    await prisma.savedView.delete({ where: { id } })
    return { deleted: true }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
