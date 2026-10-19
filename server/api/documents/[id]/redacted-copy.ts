import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { requireCapability } from '../../../utils/rbac'
import { badRequest, defineApiHandler, HttpError, notFound, readJsonBody, respond } from '../../../utils/http'
import {
  extractAttachmentText,
  nextVersion,
  validateAttachmentMeta,
  validateRedactedCopy,
  validateRedactionNote,
  visibilityForClassification
} from '../../../utils/documents'
import { documentObjectKey, documentStorage } from '../../../utils/document-storage'
import { rebuildPublicSearchText } from '../../../utils/document-archive'

/**
 * POST /api/documents/:id/redacted-copy — prepare the version the public may read
 * (benchmark amendment BC-9, plan §8.8 and §11.2).
 *
 * A redacted copy is a *derivative*, not a correction: it is appended to the same
 * immutable history with `isRedacted = true`, the document's
 * `redactedVersionId` points at it, and the original stays the current version of
 * the record. From that moment the public reader serves this version and its own
 * attachments — never the original body, never an original file.
 *
 * The officer either supplies the redacted words (or a redacted attachment) or
 * confirms the existing text is already safe. Either way the note is required:
 * "what was removed" is part of the public record, and the audit row records who
 * prepared it and when.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireCapability(user, 'documents.publish')

  const id = getRouterParam(event, 'id') ?? ''
  const document = await prisma.document.findUnique({ where: { id } })
  if (!document) throw notFound('Document not found')
  if (document.archived) throw new HttpError(409, 'That document is archived — restore it before preparing a redacted copy')

  const body = await readJsonBody(event) ?? {}
  const note = validateRedactionNote(body.redactionNote)

  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : ''
  const bytes = dataBase64 ? Buffer.from(dataBase64, 'base64') : null
  const meta = bytes ? validateAttachmentMeta(body.mime, bytes.length, body.fileName) : null

  const redacted = validateRedactedCopy(
    body,
    { title: document.title, body: document.body, tags: document.tags },
    !!meta
  )

  let store: ReturnType<typeof documentStorage>
  let storageKey: string | null = null
  let attachmentId: string | null = null
  let extractedText = ''

  if (meta && bytes) {
    store = documentStorage()
    if (!store) throw badRequest('Attachment storage is not configured in this environment')
    attachmentId = crypto.randomUUID()
    storageKey = documentObjectKey(attachmentId, meta.mime)
    await store.put(storageKey, new Uint8Array(bytes), meta.mime)
    extractedText = await extractAttachmentText(new Uint8Array(bytes), meta.mime)
  }

  const latest = await prisma.documentVersion.aggregate({
    where: { documentId: id },
    _max: { version: true }
  })
  const versionNumber = nextVersion(latest._max.version ?? document.currentVersion)

  const saved = await prisma.$transaction(async (tx) => {
    const created = await tx.documentVersion.create({
      data: {
        documentId: id,
        version: versionNumber,
        title: redacted.title,
        body: redacted.body,
        tags: redacted.tags,
        visibility: visibilityForClassification(document.classification),
        changeNote: note,
        isRedacted: true,
        createdBy: user.id
      }
    })

    if (meta && storageKey && attachmentId) {
      await tx.documentAttachment.create({
        data: {
          id: attachmentId,
          documentId: id,
          versionId: created.id,
          fileName: meta.fileName,
          mime: meta.mime,
          size: meta.size,
          storageKey,
          textContent: extractedText || null,
          textExtractedAt: extractedText ? new Date() : null,
          createdBy: user.id
        }
      })
    }

    await tx.document.update({
      where: { id },
      data: { redactedVersionId: created.id, redactionNote: note }
    })

    // The visitor's corpus follows the copy, so a phrase that only exists in the
    // original can no longer be found (or confirmed) from the public archive.
    await rebuildPublicSearchText(tx, id)

    return created
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'document_redacted_copy_prepared',
      details: JSON.stringify({
        documentId: id,
        number: document.number,
        actor: user.id,
        actorName: user.name,
        version: saved.version,
        redactionNote: note,
        confirmedExistingTextSafe: redacted.confirmedExistingTextSafe,
        attachment: meta ? { fileName: meta.fileName, mime: meta.mime, size: meta.size } : null,
        preparedBy: user.id,
        preparedAt: saved.createdAt.toISOString()
      }),
      performedBy: user.id
    }
  })

  return respond(event, 201, {
    version: {
      id: saved.id,
      version: saved.version,
      title: saved.title,
      tags: saved.tags,
      changeNote: saved.changeNote,
      isRedacted: saved.isRedacted,
      createdAt: saved.createdAt
    },
    document: {
      id,
      number: document.number,
      classification: document.classification,
      currentVersion: document.currentVersion,
      redactedVersionId: saved.id,
      redactionNote: note
    }
  })
})
