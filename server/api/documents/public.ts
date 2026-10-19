import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'
import { manilaYmd } from '../../utils/time'
import {
  documentSummary,
  normalizeTags,
  parseYear,
  publicDocumentContent,
  publicDocumentWhere
} from '../../utils/documents'
import { searchDocumentIds } from '../../utils/document-archive'
import { orderBy as orderByFor, parseTableQuery, skipTake } from '../../utils/pagination'

/**
 * Everything a visitor may see. Deliberately no `financeRef` and no internal
 * ids other than the ones a link needs: the public side of a filing is the
 * filing, not the council's paperwork about it.
 *
 * BC-9: `redactedVersion` is fetched because it is the only body a public
 * document with a redacted copy may show. The original columns are read here
 * but never mapped into the response when the copy is in force.
 */
const publicSelect = {
  id: true,
  number: true,
  title: true,
  body: true,
  tags: true,
  year: true,
  classification: true,
  redactedVersionId: true,
  redactionNote: true,
  currentVersion: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
  type: { select: { id: true, key: true, name: true } },
  event: { select: { id: true, title: true, date: true } },
  redactedVersion: {
    select: {
      version: true,
      title: true,
      body: true,
      tags: true,
      createdAt: true,
      creator: { select: { name: true, position: true } },
      _count: { select: { attachments: true } }
    }
  },
  _count: { select: { attachments: true } }
} as const

type PublicRow = {
  id: string
  number: string
  title: string
  body: string
  tags: string[]
  year: number
  classification: string
  redactedVersionId: string | null
  redactionNote: string | null
  currentVersion: number
  archived: boolean
  createdAt: Date
  updatedAt: Date
  type: { id: string, key: string, name: string }
  event: { id: string, title: string, date: Date } | null
  redactedVersion: {
    version: number
    title: string
    body: string
    tags: string[]
    createdAt: Date
    creator: { name: string, position: string } | null
    _count: { attachments: number }
  } | null
  _count: { attachments: number }
}

/**
 * The list row a visitor gets. Built explicitly rather than by spreading the
 * database row, so a body that must not be published cannot ride along in a
 * later column.
 */
function withPublicSummary(row: PublicRow) {
  const content = publicDocumentContent({
    classification: row.classification,
    archived: row.archived,
    currentVersion: row.currentVersion,
    title: row.title,
    body: row.body,
    tags: row.tags,
    // The note is the "a copy is required" marker: if the pointer was ever
    // cleared, the filing still must not fall back to its original text.
    hasRedactedCopy: !!row.redactedVersionId || !!row.redactionNote,
    redactedVersion: row.redactedVersion
  })
  if (!content.public) return null

  const isRedacted = content.source === 'redacted'
  return {
    id: row.id,
    number: row.number,
    year: row.year,
    title: content.title,
    tags: content.tags,
    summary: documentSummary(content.body),
    version: content.version,
    isRedacted,
    redactionNote: isRedacted ? row.redactionNote : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    type: row.type,
    event: row.event,
    _count: {
      attachments: isRedacted ? (row.redactedVersion?._count.attachments ?? 0) : row._count.attachments
    }
  }
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
      corpus: 'public',
      limit: table.pageSize,
      offset: (table.page - 1) * table.pageSize
    })
    const rows = ids.length > 0
      ? await prisma.document.findMany({ where: { id: { in: ids } }, select: publicSelect })
      : []
    const byId = new Map(rows.map(row => [row.id, row]))
    return {
      documents: ids.flatMap((id) => {
        const row = byId.get(id)
        return row ? [withPublicSummary(row)].filter(Boolean) : []
      }),
      types,
      total,
      page: table.page,
      pageSize: table.pageSize,
      ranked
    }
  }

  const where = publicDocumentWhere({ archived, typeId: resolvedTypeId, tag, year, eventId })
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
    documents: rows.map(withPublicSummary).filter(row => row !== null),
    total,
    page: table.page,
    pageSize: table.pageSize,
    ranked: false,
    // The filters a visitor may use. Every response carries them, so the public
    // page can offer the type filter without a second call (and the first branch
    // above — an unknown type matching nothing — already did).
    types
  }
})
