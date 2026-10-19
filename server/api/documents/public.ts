import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'
import { manilaYmd } from '../../utils/time'
import {
  documentListWhere,
  documentSummary,
  normalizeTags,
  parseYear
} from '../../utils/documents'
import { searchDocumentIds } from '../../utils/document-archive'
import { orderBy as orderByFor, parseTableQuery, skipTake } from '../../utils/pagination'

/**
 * Everything a visitor may see. Deliberately no `financeRef` and no internal
 * ids other than the ones a link needs: the public side of a filing is the
 * filing, not the council's paperwork about it.
 */
const publicSelect = {
  id: true,
  number: true,
  title: true,
  body: true,
  year: true,
  tags: true,
  currentVersion: true,
  createdAt: true,
  updatedAt: true,
  type: { select: { id: true, key: true, name: true } },
  event: { select: { id: true, title: true, date: true } },
  _count: { select: { attachments: true } }
} as const

function withSummary<T extends { body: string }>(row: T) {
  const { body, ...rest } = row
  return { ...rest, summary: documentSummary(body) }
}

/**
 * GET /api/documents/public — the published archive, for anyone (plan §8.8).
 * No session, no officers-only filing: the where clause is built from the
 * public scope, so an unpublished document cannot leak through a filter.
 *
 * `?q=` searches titles, bodies, tags *and the text inside uploaded files*
 * (the generated tsvector covers the extracted file text), ranked by relevance.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const query = getQuery(event)
  const table = parseTableQuery(query, {
    allowedSort: ['createdAt', 'number', 'title', 'year'],
    defaultSort: 'createdAt',
    defaultDir: 'desc'
  })

  const typeKey = typeof query.type === 'string' ? query.type.trim() : ''
  const typeId = typeof query.typeId === 'string' ? query.typeId.trim() : ''
  const tag = normalizeTags([typeof query.tag === 'string' ? query.tag : ''])[0]
  const year = typeof query.year === 'string' && query.year.trim()
    ? parseYear(query.year, Number(manilaYmd().slice(0, 4)))
    : null
  const eventId = typeof query.eventId === 'string' && query.eventId.trim() ? query.eventId.trim() : null

  let resolvedTypeId: string | null = typeId || null
  if (!resolvedTypeId && typeKey) {
    const type = await prisma.documentType.findUnique({ where: { key: typeKey }, select: { id: true } })
    resolvedTypeId = type?.id ?? null
  }

  const scope = 'public' as const
  const archived = 'active' as const

  // The filter chips need the type list, and this endpoint is the only document
  // route a signed-out visitor may call.
  const types = await prisma.documentType.findMany({
    where: { archived: false },
    orderBy: { name: 'asc' },
    select: { id: true, key: true, name: true }
  })

  // A filter naming a type that does not exist can match nothing — never
  // everything, which is what a dropped filter would show a visitor.
  if (typeKey && !resolvedTypeId) {
    return { documents: [], types, total: 0, page: table.page, pageSize: table.pageSize, ranked: false }
  }

  if (table.q) {
    const { ids, total, ranked } = await searchDocumentIds({
      q: table.q,
      scope,
      archived,
      typeId: resolvedTypeId,
      tag,
      year,
      eventId,
      limit: table.pageSize,
      offset: (table.page - 1) * table.pageSize
    })
    const rows = ids.length > 0
      ? await prisma.document.findMany({ where: { id: { in: ids } }, select: publicSelect })
      : []
    const byId = new Map(rows.map(row => [row.id, row]))
    return {
      documents: ids.flatMap(id => (byId.has(id) ? [withSummary(byId.get(id)!)] : [])),
      types,
      total,
      page: table.page,
      pageSize: table.pageSize,
      ranked
    }
  }

  const where = documentListWhere({ scope, archived, typeId: resolvedTypeId, tag, year, eventId })
  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: orderByFor(table, { createdAt: 'desc' }),
      select: publicSelect,
      ...skipTake(table)
    })
  ])

  return {
    documents: rows.map(row => withSummary(row)),
    total,
    page: table.page,
    pageSize: table.pageSize,
    ranked: false
  }
})
