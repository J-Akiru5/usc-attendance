import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { requireCapability } from '../../utils/rbac'
import { badRequest, defineApiHandler, readJsonBody, respond } from '../../utils/http'
import { manilaYmd } from '../../utils/time'
import {
  documentListWhere,
  documentSearchText,
  documentSummary,
  formatDocumentNumber,
  normalizeTags,
  parseArchivedFilter,
  parseDocumentScope,
  parseYear,
  publishAudit,
  publishRequiresConfirmation,
  requestedClassification,
  validateDocumentContent,
  validateFinanceRef,
  visibilityForClassification
} from '../../utils/documents'
import { nextDocumentSequence, searchDocumentIds } from '../../utils/document-archive'
import { orderBy as orderByFor, parseTableQuery, skipTake } from '../../utils/pagination'

/**
 * GET  /api/documents — the archive as the council sees it: every filing, with
 *                      search, filters and paging (plan §8.8). Officers only.
 * POST /api/documents — file a document: it gets the next number for its type
 *                      and year, and its first immutable version.
 */

const SORTABLE = ['createdAt', 'updatedAt', 'number', 'title', 'year'] as const

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

function withSummary<T extends { body: string }>(row: T) {
  const { body, ...rest } = row
  return { ...rest, summary: documentSummary(body) }
}

const listSelect = {
  id: true,
  number: true,
  title: true,
  body: true,
  year: true,
  sequence: true,
  tags: true,
  visibility: true,
  classification: true,
  redactedVersionId: true,
  redactionNote: true,
  currentVersion: true,
  archived: true,
  eventId: true,
  financeRef: true,
  createdAt: true,
  updatedAt: true,
  type: { select: { id: true, key: true, name: true, prefix: true, pad: true } },
  creator: { select: { id: true, name: true } },
  event: { select: { id: true, title: true, date: true } },
  _count: { select: { versions: true, attachments: true } }
} as const

export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const method = getMethod(event)

  if (method === 'GET') {
    requireStaff(user)
    const query = getQuery(event)
    const table = parseTableQuery(query, {
      allowedSort: [...SORTABLE],
      defaultSort: 'createdAt',
      defaultDir: 'desc'
    })
    const scope = parseDocumentScope(query.scope)
    const archived = parseArchivedFilter(query.archived)
    const tag = normalizeTags([str(query.tag)])[0]
    const eventId = str(query.eventId) || null
    const year = str(query.year) ? parseYear(query.year, Number(manilaYmd().slice(0, 4))) : null

    // A type may be asked for by id (the picker) or by its key (a link).
    const typeKey = str(query.type)
    const requestedTypeId = str(query.typeId)
    let typeId = requestedTypeId || null
    if (!typeId && typeKey) {
      const type = await prisma.documentType.findUnique({ where: { key: typeKey }, select: { id: true } })
      if (!type) throw badRequest(`Unknown filing type: ${typeKey}`)
      typeId = type.id
    }

    if (table.q) {
      const { ids, total, ranked } = await searchDocumentIds({
        q: table.q,
        scope,
        archived,
        typeId,
        tag,
        year,
        eventId,
        limit: table.pageSize,
        offset: (table.page - 1) * table.pageSize
      })
      const rows = ids.length > 0
        ? await prisma.document.findMany({ where: { id: { in: ids } }, select: listSelect })
        : []
      const byId = new Map(rows.map(row => [row.id, row]))
      return {
        documents: ids.flatMap(id => (byId.has(id) ? [withSummary(byId.get(id)!)] : [])),
        total,
        page: table.page,
        pageSize: table.pageSize,
        ranked
      }
    }

    const where = documentListWhere({ scope, archived, typeId, tag, year, eventId })

    const [total, rows] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        orderBy: orderByFor(table, { createdAt: 'desc' }),
        select: listSelect,
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
  }

  if (method === 'POST') {
    requireCapability(user, 'documents.publish')

    const body = await readJsonBody(event) ?? {}
    const typeKey = str(body.typeKey)
    const typeId = str(body.typeId)
    if (!typeId && !typeKey) throw badRequest('Pick a filing type')
    const type = typeId
      ? await prisma.documentType.findUnique({ where: { id: typeId } })
      : await prisma.documentType.findUnique({ where: { key: typeKey } })
    if (!type) throw badRequest('That filing type does not exist')
    if (type.archived) throw badRequest('That filing type is archived — pick another one')

    const year = parseYear(body.year, Number(manilaYmd().slice(0, 4)))
    const content = validateDocumentContent(body)
    const classification = requestedClassification(body)
    const visibility = visibilityForClassification(classification)
    const financeRef = validateFinanceRef(body.financeRef)

    // BC-9: a new filing that goes straight to the public archive is a publish.
    // Without a redacted copy (impossible on create) someone must confirm the
    // text carries no unauthorised student name, and the audit says so.
    if (publishRequiresConfirmation({ from: 'officers', to: classification, hasRedactedCopy: false })
      && body.confirmUnredactedPublish !== true) {
      throw badRequest('Publishing without a redacted copy needs confirmation — set confirmUnredactedPublish to true once you have checked the text for student names')
    }

    // Everything that can be wrong is checked *before* the number is drawn: a
    // wasted number is a gap in the series, so avoid one where we can.
    const eventId = str(body.eventId) || null
    if (eventId) {
      const event = await prisma.event.count({ where: { id: eventId } })
      if (!event) throw badRequest('That event does not exist')
    }

    const sequence = await nextDocumentSequence(type.id, year)
    const number = formatDocumentNumber(type, year, sequence)

    const createdId = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          typeId: type.id,
          year,
          sequence,
          number,
          title: content.title,
          body: content.body,
          tags: content.tags,
          visibility,
          classification,
          currentVersion: 1,
          eventId,
          financeRef,
          createdBy: user.id
        }
      })
      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          version: 1,
          title: content.title,
          body: content.body,
          tags: content.tags,
          visibility,
          createdBy: user.id
        }
      })
      // The generated tsvector follows searchText, so the first version is
      // searchable the moment this transaction commits. With no redacted copy
      // yet, the visitor's corpus is the same text.
      const searchText = documentSearchText({ title: content.title, body: content.body, tags: content.tags })
      await tx.document.update({ where: { id: document.id }, data: { searchText, publicSearchText: searchText } })
      return document.id
    })

    const created = await prisma.document.findUniqueOrThrow({ where: { id: createdId }, select: listSelect })

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'document_filed',
        details: JSON.stringify({
          documentId: created.id,
          number: created.number,
          type: type.key,
          year,
          visibility,
          classification,
          actorName: user.name
        }),
        performedBy: user.id
      }
    })

    const publication = publishAudit({ from: 'officers', to: classification, hasRedactedCopy: false })
    if (publication) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: publication.action,
          details: JSON.stringify({
            documentId: created.id,
            number: created.number,
            actor: user.id,
            actorName: user.name,
            from: 'officers',
            to: classification,
            redactedCopyInForce: publication.redactedCopyInForce,
            confirmedUnredacted: body.confirmUnredactedPublish === true,
            warning: publication.warning
          }),
          performedBy: user.id
        }
      })
    }

    return respond(event, 201, { document: withSummary(created) })
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
