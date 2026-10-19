import { getMethod, getRouterParam, setResponseHeader } from 'h3'
import { prisma } from '../../../../utils/prisma'
import { authenticate } from '../../../../utils/auth'
import { hasCapability } from '../../../../utils/rbac'
import { defineApiHandler, HttpError, notFound, respond } from '../../../../utils/http'
import { attachmentIsPubliclyReadable } from '../../../../utils/documents'
import { documentStorage } from '../../../../utils/document-storage'

/**
 * GET /api/documents/:id/attachments/:attachmentId — the uploaded file itself
 * (plan §8.8). Bytes come from object storage, never the database.
 *
 * Officers may read any attachment; everybody else only the attachments of a
 * document that is published. An officers-only filing answers 404 rather than
 * 403 — a signed-out visitor learns nothing about whether it exists.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  // Anonymous callers are allowed, for published documents.
  let capabilities: readonly string[]
  try {
    const user = await authenticate(event)
    capabilities = user.capabilities
  } catch {
    capabilities = []
  }

  const documentId = getRouterParam(event, 'id') ?? ''
  const attachmentId = getRouterParam(event, 'attachmentId') ?? ''

  const attachment = await prisma.documentAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      document: {
        select: { id: true, classification: true, redactedVersionId: true, archived: true }
      }
    }
  })
  if (!attachment || attachment.documentId !== documentId) throw notFound('Attachment not found')

  if (!hasCapability(capabilities, 'staff.access') && !attachmentIsPubliclyReadable({
    classification: attachment.document.classification,
    archived: attachment.document.archived,
    redactedVersionId: attachment.document.redactedVersionId,
    attachmentVersionId: attachment.versionId
  })) {
    throw notFound('Attachment not found')
  }

  const store = documentStorage()
  if (!store) throw new HttpError(503, 'Attachment storage is not configured')

  const bytes = await store.get(attachment.storageKey)

  const plainName = attachment.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  setResponseHeader(event, 'Content-Type', attachment.mime)
  setResponseHeader(
    event,
    'Content-Disposition',
    `inline; filename="${plainName}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`
  )
  setResponseHeader(event, 'Cache-Control', 'private, max-age=60')
  return bytes
})
