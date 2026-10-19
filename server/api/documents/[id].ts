import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { requireCapability } from '../../utils/rbac'
import { badRequest, defineApiHandler, notFound, readJsonBody, respond } from '../../utils/http'
import {
  publishAudit,
  publishRequiresConfirmation,
  validateClassification,
  validateFinanceRef,
  visibilityForClassification
} from '../../utils/documents'
import { auditContext, auditWrite } from '../../utils/audit'

/**
 * /api/documents/:id — one filing, in full (plan §8.8).
 *   GET  the current side of it: content, who filed it, its links, the version
 *        list and the attachments. Officers only.
 *   PUT  the filing metadata that is *not* content — the event and finance
 *        links and the archive flag. Editing the words goes through
 *        POST /api/documents/:id/versions, which appends a version.
 */

const detailInclude = {
  type: { select: { id: true, key: true, name: true, prefix: true, pad: true } },
  creator: { select: { id: true, name: true, position: true } },
  event: { select: { id: true, title: true, date: true } },
  redactedVersion: {
    select: {
      id: true,
      version: true,
      title: true,
      body: true,
      tags: true,
      changeNote: true,
      createdAt: true,
      creator: { select: { id: true, name: true } }
    }
  },
  versions: {
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      title: true,
      changeNote: true,
      visibility: true,
      isRedacted: true,
      createdAt: true,
      creator: { select: { id: true, name: true } },
      _count: { select: { attachments: true } }
    }
  },
  attachments: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      versionId: true,
      fileName: true,
      mime: true,
      size: true,
      textExtractedAt: true,
      createdAt: true,
      creator: { select: { id: true, name: true } }
    }
  }
} as const

export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  requireStaff(user)
  const id = getRouterParam(event, 'id') ?? ''
  const method = getMethod(event)

  const document = await prisma.document.findUnique({ where: { id } })
  if (!document) throw notFound('Document not found')

  if (method === 'GET') {
    const full = await prisma.document.findUniqueOrThrow({ where: { id }, include: detailInclude })
    return {
      document: {
        ...full,
        attachments: full.attachments.map(attachment => ({
          ...attachment,
          hasText: !!attachment.textExtractedAt
        }))
      }
    }
  }

  if (method !== 'PUT') return respond(event, 405, { error: 'Method not allowed' })

  requireCapability(user, 'documents.publish')
  const body = await readJsonBody(event) ?? {}

  const data: { eventId?: string | null, financeRef?: string | null, archived?: boolean, classification?: string, visibility?: string } = {}

  let classificationChange: { from: string, to: string } | null = null

  // BC-9: publishing is its own audited act. `visibility` is deliberately not
  // read here — content fields never silently move a filing's audience.
  if ('classification' in body) {
    const to = validateClassification(body.classification)
    const from = document.classification
    if (to !== from) {
      const hasRedactedCopy = !!document.redactedVersionId
      if (publishRequiresConfirmation({ from, to, hasRedactedCopy }) && body.confirmUnredactedPublish !== true) {
        throw badRequest('Publishing without a redacted copy needs confirmation — prepare a redacted copy, or set confirmUnredactedPublish to true once you have checked the text for student names')
      }
      data.classification = to
      data.visibility = visibilityForClassification(to)
      classificationChange = { from, to }
    }
  }

  if ('eventId' in body) {
    const requested = typeof body.eventId === 'string' ? body.eventId.trim() : ''
    if (requested) {
      const exists = await prisma.event.count({ where: { id: requested } })
      if (!exists) throw badRequest('That event does not exist')
      data.eventId = requested
    } else {
      data.eventId = null
    }
  }

  if ('financeRef' in body) {
    data.financeRef = validateFinanceRef(body.financeRef)
  }

  if ('archived' in body) {
    if (typeof body.archived !== 'boolean') throw badRequest('archived must be true or false')
    data.archived = body.archived
  }

  if (Object.keys(data).length === 0) throw badRequest('Nothing to change')

  const updated = await prisma.document.update({
    where: { id },
    data,
    include: detailInclude
  })

  const publication = classificationChange
    ? publishAudit({
        from: classificationChange.from,
        to: classificationChange.to,
        hasRedactedCopy: !!document.redactedVersionId
      })
    : null

  await auditWrite(prisma, {
    actor: user,
    action: auditAction(data, classificationChange, publication),
    targetType: 'document',
    targetId: id,
    details: publication
      ? {
          number: document.number,
          from: classificationChange?.from,
          to: classificationChange?.to,
          redactedCopyInForce: publication.redactedCopyInForce,
          redactedVersionId: document.redactedVersionId,
          confirmedUnredacted: body.confirmUnredactedPublish === true,
          warning: publication.warning,
          changes: Object.keys(data)
        }
      : {
          number: document.number,
          changes: Object.keys(data)
        },
    ...auditContext(event)
  })

  return { document: updated }
})

/**
 * The action name for a metadata change. A publish gets the dedicated, louder
 * action; a move out of public is its own event; everything else stays the
 * generic update/archive pair.
 */
function auditAction(
  data: { archived?: boolean },
  classificationChange: { from: string, to: string } | null,
  publication: ReturnType<typeof publishAudit>
): string {
  if (publication) return publication.action
  if (classificationChange) {
    return classificationChange.from === 'public' ? 'document_unpublished' : 'document_reclassified'
  }
  return data.archived === undefined ? 'document_updated' : data.archived ? 'document_archived' : 'document_restored'
}
