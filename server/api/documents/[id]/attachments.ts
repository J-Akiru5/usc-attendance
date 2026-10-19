import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { requireCapability } from '../../../utils/rbac'
import { badRequest, defineApiHandler, HttpError, notFound, readJsonBody, respond } from '../../../utils/http'
import { extractAttachmentText, validateAttachmentMeta } from '../../../utils/documents'
import { documentObjectKey, documentStorage } from '../../../utils/document-storage'
import { rebuildPublicSearchText, rebuildSearchText } from '../../../utils/document-archive'

/**
 * POST /api/documents/:id/attachments — add a file to a filing (plan §8.8).
 *
 * The bytes go to object storage (never the database, §11.1) and are read once,
 * here, to extract their text: that text joins the document's search corpus, so
 * a phrase that exists only inside an uploaded file is still found by search.
 * A file we cannot read (a scan) is still filed — it just adds no words.
 *
 * The body is base64 JSON, the same shape the excuse attachments use. That caps
 * a single file at what one request can carry (~3 MB behind the Vercel body
 * limit); larger papers will move to the presigned direct-to-R2 flow that the
 * photo uploads already use — see the phase report.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireCapability(user, 'documents.publish')

  const id = getRouterParam(event, 'id') ?? ''
  const document = await prisma.document.findUnique({
    where: { id },
    select: { id: true, number: true, title: true, body: true, tags: true, archived: true, currentVersion: true }
  })
  if (!document) throw notFound('Document not found')
  if (document.archived) throw new HttpError(409, 'That document is archived — restore it before adding files')

  const body = await readJsonBody(event) ?? {}
  const data = typeof body.dataBase64 === 'string' ? body.dataBase64 : ''
  if (!data) throw badRequest('dataBase64 is required')
  const bytes = Buffer.from(data, 'base64')
  const meta = validateAttachmentMeta(body.mime, bytes.length, body.fileName)

  const store = documentStorage()
  if (!store) throw badRequest('Attachment storage is not configured in this environment')

  const attachmentId = crypto.randomUUID()
  const storageKey = documentObjectKey(attachmentId, meta.mime)
  await store.put(storageKey, new Uint8Array(bytes), meta.mime)

  const text = await extractAttachmentText(new Uint8Array(bytes), meta.mime)

  // A file joins the version it was uploaded with, so history can say when it
  // arrived; the file itself is never removed when a new version is filed.
  const version = await prisma.documentVersion.findUnique({
    where: { documentId_version: { documentId: id, version: document.currentVersion } },
    select: { id: true }
  })

  const attachment = await prisma.documentAttachment.create({
    data: {
      id: attachmentId,
      documentId: id,
      versionId: version?.id ?? null,
      fileName: meta.fileName,
      mime: meta.mime,
      size: meta.size,
      storageKey,
      textContent: text || null,
      textExtractedAt: text ? new Date() : null,
      createdBy: user.id
    },
    select: { id: true, fileName: true, mime: true, size: true, versionId: true, createdAt: true }
  })

  // The generated tsvector follows searchText, so re-build the corpus now that
  // the file's words are known. The public corpus follows it too unless a
  // redacted copy is in force, in which case only that copy's files count.
  await rebuildSearchText(prisma, id, { title: document.title, body: document.body, tags: document.tags })
  await rebuildPublicSearchText(prisma, id)

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'document_attachment_added',
      details: JSON.stringify({
        documentId: id,
        number: document.number,
        attachmentId,
        fileName: meta.fileName,
        mime: meta.mime,
        size: meta.size,
        textChars: text.length
      }),
      performedBy: user.id
    }
  })

  return respond(event, 201, {
    attachment: { ...attachment, hasText: text.length > 0 }
  })
})
