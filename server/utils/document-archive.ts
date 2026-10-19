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
export type DocumentDb = Pick<PrismaClient, 'document' | 'documentAttachment' | 'documentVersion'>

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

/**
 * The visitor's corpus (BC-9). Normally the same words the officers search, but
 * when a redacted copy is in force it is built from *that* version and its own
 * files only — so a public search cannot find, and therefore cannot confirm,
 * a phrase that only exists in the original. A pointer that does not resolve
 * produces an empty corpus rather than falling back to the original.
 */
export async function rebuildPublicSearchText(db: DocumentDb, documentId: string): Promise<string> {
  const document = await db.document.findUnique({
    where: { id: documentId },
    select: { title: true, body: true, tags: true, redactedVersionId: true }
  })
  if (!document) throw new Error('The document disappeared while its public corpus was rebuilt')

  let content: { title: string, body: string, tags: string[] } = {
    title: document.title,
    body: document.body,
    tags: document.tags
  }

  let attachmentTexts: Array<string | null> = []

  if (document.redactedVersionId) {
    const copy = await db.documentVersion.findFirst({
      where: { id: document.redactedVersionId, documentId },
      select: { title: true, body: true, tags: true }
    })
    if (copy) {
      content = copy
      const attachments = await db.documentAttachment.findMany({
        where: { documentId, versionId: document.redactedVersionId },
        select: { textContent: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_CORPUS_ATTACHMENTS
      })
      attachmentTexts = attachments.map(attachment => attachment.textContent)
    } else {
      content = { title: '', body: '', tags: [] }
    }
  } else {
    const attachments = await db.documentAttachment.findMany({
      where: { documentId },
      select: { textContent: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_CORPUS_ATTACHMENTS
    })
    attachmentTexts = attachments.map(attachment => attachment.textContent)
  }

  const searchText = documentSearchText({ ...content, attachmentTexts })
  await db.document.update({ where: { id: documentId }, data: { publicSearchText: searchText } })
  return searchText
}

export interface DocumentSearchParams extends DocumentListFilters {
  q: string
  limit: number
  offset: number
  /**
   * Which corpus to search: `staff` (the original record) or `public` (the
   * redacted copy when one is in force). The public corpus also pins the
   * classification, so a restricted filing can never surface through search.
   */
  corpus?: 'staff' | 'public'
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
  if (params.corpus === 'public') {
    // Classification is the authority, and the visitor's corpus is the redacted
    // text. Both together mean search can neither list an unpublished filing nor
    // match a phrase that was redacted out of one.
    conditions.push(Prisma.sql`d."classification" = 'public'`)
  } else {
    const scope = params.scope
    if (scope === 'public' || scope === 'officers' || scope === 'restricted') {
      conditions.push(Prisma.sql`d."classification" = ${scope}`)
    }
  }
  if (params.typeId) conditions.push(Prisma.sql`d."typeId" = ${params.typeId}`)
  if (params.tag) conditions.push(Prisma.sql`${params.tag} = ANY(d."tags")`)
  if (params.year) conditions.push(Prisma.sql`d."year" = ${params.year}`)
  if (params.eventId) conditions.push(Prisma.sql`d."eventId" = ${params.eventId}`)

  const vector = params.corpus === 'public' ? Prisma.sql`d."publicSearchVector"` : Prisma.sql`d."searchVector"`
  const corpusText = params.corpus === 'public' ? Prisma.sql`d."publicSearchText"` : Prisma.sql`d."searchText"`

  const tsquery = buildSearchQuery(params.q)
  const fallback = !tsquery && params.q.trim().length > 0
  if (tsquery) {
    conditions.push(Prisma.sql`${vector} @@ to_tsquery('simple', ${tsquery})`)
  } else if (fallback) {
    conditions.push(Prisma.sql`${corpusText} ILIKE ${`%${escapeLike(params.q.trim())}%`}`)
  }

  const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  const rank = tsquery
    ? Prisma.sql`, ts_rank(${vector}, to_tsquery('simple', ${tsquery})) AS rank`
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
