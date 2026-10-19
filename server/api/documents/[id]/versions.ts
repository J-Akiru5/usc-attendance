import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { requireCapability } from '../../../utils/rbac'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../../utils/http'
import { hasContentChange, nextVersion, validateChangeNote, validateDocumentContent } from '../../../utils/documents'
import { rebuildSearchText } from '../../../utils/document-archive'

/**
 * /api/documents/:id/versions — the immutable history (plan §8.8).
 *   GET  every version of the filing, newest first, with who filed it and when.
 *   POST append a new version: the older wording stays exactly as it was, the
 *        document row moves to the new one and is marked as the current version.
 */

export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const id = getRouterParam(event, 'id') ?? ''
  const method = getMethod(event)

  const document = await prisma.document.findUnique({ where: { id } })
  if (!document) throw notFound('Document not found')

  if (method === 'GET') {
    requireStaff(user)
    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        title: true,
        body: true,
        tags: true,
        visibility: true,
        changeNote: true,
        createdAt: true,
        creator: { select: { id: true, name: true, position: true } },
        _count: { select: { attachments: true } }
      }
    })
    return {
      document: { id: document.id, number: document.number, currentVersion: document.currentVersion },
      versions
    }
  }

  if (method !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  requireCapability(user, 'documents.publish')
  if (document.archived) throw new HttpError(409, 'That document is archived — restore it before filing a new version')

  const body = await readJsonBody(event) ?? {}
  const content = validateDocumentContent(body, {
    title: document.title,
    body: document.body,
    tags: document.tags,
    visibility: document.visibility
  })
  const changeNote = validateChangeNote(body.changeNote)

  const current = {
    title: document.title,
    body: document.body,
    tags: document.tags,
    visibility: document.visibility as 'public' | 'officers'
  }
  if (!hasContentChange(current, content, changeNote)) {
    throw badRequest('Nothing changed — the current version already reads like this (add a change note to re-issue it)')
  }

  const version = nextVersion(document.currentVersion)

  const saved = await prisma.$transaction(async (tx) => {
    const created = await tx.documentVersion.create({
      data: {
        documentId: id,
        version,
        title: content.title,
        body: content.body,
        tags: content.tags,
        visibility: content.visibility,
        changeNote,
        createdBy: user.id
      }
    })
    await rebuildSearchText(tx, id, content)
    await tx.document.update({
      where: { id },
      data: {
        title: content.title,
        body: content.body,
        tags: content.tags,
        visibility: content.visibility,
        currentVersion: version
      }
    })
    return created
  }).catch((err: unknown) => {
    // The unique (documentId, version) index is the referee: if two officers
    // filed at the same instant, the loser is told to reload, not served a 500.
    if (isUniqueViolation(err)) {
      throw new HttpError(409, 'Someone filed a version at the same moment — reload the document and try again')
    }
    throw err
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'document_version_filed',
      details: JSON.stringify({
        documentId: id,
        number: document.number,
        version,
        visibility: content.visibility,
        changeNote
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
      visibility: saved.visibility,
      changeNote: saved.changeNote,
      createdAt: saved.createdAt
    },
    document: { id, number: document.number, currentVersion: version }
  })
})
