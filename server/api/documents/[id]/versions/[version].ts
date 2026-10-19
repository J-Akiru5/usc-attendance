import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../../utils/prisma'
import { authenticate, requireStaff } from '../../../../utils/auth'
import { defineApiHandler, notFound, respond } from '../../../../utils/http'

/**
 * GET /api/documents/:id/versions/:version — one older version, exactly as it
 * was filed: its words, who filed it and when (plan §8.8). Read-only by design;
 * there is no route that edits or deletes a version.
 *
 * Officers only: the current text of a public document is on the public site,
 * but superseded wording is an internal record.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const id = getRouterParam(event, 'id') ?? ''
  const requested = Number.parseInt(getRouterParam(event, 'version') ?? '', 10)
  if (!Number.isInteger(requested) || requested < 1) throw notFound('Version not found')

  const version = await prisma.documentVersion.findUnique({
    where: { documentId_version: { documentId: id, version: requested } },
    include: {
      document: { select: { id: true, number: true, currentVersion: true } },
      creator: { select: { id: true, name: true, position: true } },
      attachments: {
        select: { id: true, fileName: true, mime: true, size: true, textExtractedAt: true }
      }
    }
  })
  if (!version) throw notFound('Version not found')

  return {
    version,
    isCurrent: version.document.currentVersion === version.version
  }
})
