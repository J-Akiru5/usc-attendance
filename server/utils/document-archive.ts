import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from './prisma'
import {
  MAX_CORPUS_ATTACHMENTS,
  buildSearchQuery,
  documentSearchText,
  type DocumentListFilters
} from './documents'

/**
 * The database half of the documents archive (plan §8.8): the atomic filing
 * counter and the ranked full-text search. Kept apart from `documents.ts` so
 * the pure rules stay testable without a database.
 */

/** Any client that can write documents — the root client or a transaction. */
export type DocumentDb = Pick<PrismaClient, 'document' | 'documentAttachment'>

/**
 * Hands out the next filing number for a type and year.
 *
 * One statement, so it is atomic under concurrency: PostgreSQL locks the
 * counter row while `DO UPDATE` runs, which means two officers filing at the
 * same instant are serialised and draw consecutive numbers (the live suite
 * proves it with two parallel creates). The number is *not* handed back if the
 * filing that requested it fails — numbers are never reused, and a gap in a
 * minutes series is a smaller lie than a duplicate.
 */
export async function nextDocumentSequence(typeId: string, year: number): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ last: number }>>`
    INSERT INTO "document_sequences" ("typeId", "year", "last", "updatedAt")
    VALUES (${typeId}, ${year}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("typeId", "year")
    DO UPDATE SET "last" = "document_sequences"."last" + 1, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "last"
  `
  const last = rows[0]?.last
  if (typeof last !== 'number') throw new Error('The document sequence did not return a number')
  return last
}

/**
 * The corpus the generated tsvector is built from: the current content plus the
 * text extracted from every attachment. Rebuilt on every content change and
 * after each upload, so a phrase that only exists inside a file is still found.
 */
export async function rebuildSearchText(
  db: DocumentDb,
  documentId: string,
  content: { title: string, body: string, tags: string[] }
): Promise<string> {
  const attachments = await db.documentAttachment.findMany({
    where: { documentId },
    select: { textContent: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_CORPUS_ATTACHMENTS
  })
  const searchText = documentSearchText({
    title: content.title,
    body: content.body,
    tags: content.tags,
    attachmentTexts: attachments.map(attachment => attachment.textContent)
  })
  await db.document.update({ where: { id: documentId }, data: { searchText } })
  return searchText
}

export interface DocumentSearchParams extends DocumentListFilters {
  q: string
  limit: number
  offset: number
}

export interface DocumentSearchResult {
  ids: string[]
  total: number
  /** True when the words were matched by full-text search, false for a fallback substring match. */
  ranked: boolean
}

/** `%` and `_` are wildcards in a LIKE pattern; the fallback search means them literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`)
}

/**
 * Full-text search over the archive, ordered by relevance. The words are turned
 * into a `to_tsquery` expression by the pure builder (AND of prefix terms, both
 * spellings of an accented word) and matched against the GIN-indexed generated
 * tsvector, which covers titles, bodies, tags and the text of every attachment.
 *
 * When the query has nothing indexable in it (punctuation only) it falls back
 * to a substring match over the same corpus, so search never answers "nothing"
 * because of how the words were typed.
 */
export async function searchDocumentIds(params: DocumentSearchParams): Promise<DocumentSearchResult> {
  const conditions: Prisma.Sql[] = []
  if (params.archived === 'active') conditions.push(Prisma.sql`d."archived" = FALSE`)
  if (params.archived === 'archived') conditions.push(Prisma.sql`d."archived" = TRUE`)
  if (params.scope === 'public') conditions.push(Prisma.sql`d."visibility" = 'public'`)
  if (params.scope === 'officers') conditions.push(Prisma.sql`d."visibility" = 'officers'`)
  if (params.typeId) conditions.push(Prisma.sql`d."typeId" = ${params.typeId}`)
  if (params.tag) conditions.push(Prisma.sql`${params.tag} = ANY(d."tags")`)
  if (params.year) conditions.push(Prisma.sql`d."year" = ${params.year}`)
  if (params.eventId) conditions.push(Prisma.sql`d."eventId" = ${params.eventId}`)

  const tsquery = buildSearchQuery(params.q)
  const fallback = !tsquery && params.q.trim().length > 0
  if (tsquery) {
    conditions.push(Prisma.sql`d."searchVector" @@ to_tsquery('simple', ${tsquery})`)
  } else if (fallback) {
    conditions.push(Prisma.sql`d."searchText" ILIKE ${`%${escapeLike(params.q.trim())}%`}`)
  }

  const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  const rank = tsquery
    ? Prisma.sql`, ts_rank(d."searchVector", to_tsquery('simple', ${tsquery})) AS rank`
    : Prisma.empty
  const order = tsquery
    ? Prisma.sql`ORDER BY rank DESC, d."createdAt" DESC`
    : Prisma.sql`ORDER BY d."year" DESC, d."sequence" DESC`

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string, rank?: number }>>`
      SELECT d."id"${rank} FROM "documents" d ${where} ${order}
      LIMIT ${params.limit} OFFSET ${params.offset}
    `,
    prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::int AS total FROM "documents" d ${where}
    `
  ])

  return { ids: rows.map(row => row.id), total: counted[0]?.total ?? 0, ranked: !!tsquery }
}
