import { getMethod, getQuery, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { defineApiHandler, notFound, respond } from '../../../utils/http'
import { publicDocumentContent } from '../../../utils/documents'

/**
 * GET /api/documents/public/:id — one published filing, in full (plan §8.8).
 *
 * BC-9: a document with a redacted copy serves that copy and its own files —
 * never the original body, and never an original attachment. A `restricted` or
 * officers-only document, an archived one, or a request for a version other
 * than the published one all answer 404, which is also what a signed-out visitor
 * gets for an id that never existed.
 */
const attachmentSelect = {
  id: true,
  fileName: true,
  mime: true,
  size: true
} as const

export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const id = getRouterParam(event, 'id') ?? ''
  const query = getQuery(event)
  let requestedVersion: number | null = null
  if (typeof query.version === 'string' && query.version.trim()) {
    const raw = query.version.trim()
    const parsed = Number(raw)
    // A malformed version is a 404 like any other unpublishable request: the
    // visitor learns nothing about which versions exist.
    if (!/^\d+$/.test(raw) || !Number.isInteger(parsed) || parsed < 1) throw notFound('Document not found')
    requestedVersion = parsed
  }

  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      title: true,
      body: true,
      year: true,
      tags: true,
      visibility: true,
      classification: true,
      archived: true,
      currentVersion: true,
      redactedVersionId: true,
      redactionNote: true,
      createdAt: true,
      updatedAt: true,
      type: { select: { id: true, key: true, name: true, prefix: true, pad: true } },
      creator: { select: { name: true, position: true } },
      event: { select: { id: true, title: true, date: true } },
      attachments: {
        orderBy: { createdAt: 'asc' },
        select: attachmentSelect
      },
      redactedVersion: {
        select: {
          version: true,
          title: true,
          body: true,
          tags: true,
          createdAt: true,
          creator: { select: { name: true, position: true } },
          attachments: {
            orderBy: { createdAt: 'asc' },
            select: attachmentSelect
          }
        }
      },
      versions: {
        orderBy: { version: 'desc' },
        select: { version: true, createdAt: true, isRedacted: true }
      }
    }
  })
  if (!document) throw notFound('Document not found')

  const content = publicDocumentContent({
    classification: document.classification,
    archived: document.archived,
    currentVersion: document.currentVersion,
    title: document.title,
    body: document.body,
    tags: document.tags,
    hasRedactedCopy: !!document.redactedVersionId || !!document.redactionNote,
    redactedVersion: document.redactedVersion,
    requestedVersion
  })
  if (!content.public) throw notFound('Document not found')

  const isRedacted = content.source === 'redacted'
  const attachments = isRedacted ? (document.redactedVersion?.attachments ?? []) : document.attachments

  return {
    document: {
      id: document.id,
      number: document.number,
      year: document.year,
      title: content.title,
      body: content.body,
      tags: content.tags,
      version: content.version,
      isRedacted,
      redaction: isRedacted
        ? {
            note: document.redactionNote,
            preparedBy: document.redactedVersion?.creator?.name ?? null,
            preparedAt: document.redactedVersion?.createdAt ?? null
          }
        : null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      type: document.type,
      creator: document.creator,
      event: document.event,
      attachments,
      // The public record is the version being served. Superseded wording and
      // who filed it is the council's own bookkeeping, not the published filing
      // — and for a redacted copy even the original's version list is withheld.
      versions: isRedacted
        ? null
        : { current: document.currentVersion, filed: document.versions.map(v => v.version) }
    }
  }
})
