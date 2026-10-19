import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { defineApiHandler, notFound, respond } from '../../../utils/http'
import { documentIsPubliclyReadable } from '../../../utils/documents'

/**
 * GET /api/documents/public/:id — one published filing, in full (plan §8.8).
 * Anyone may read it; an officers-only (or archived) filing answers 404, which
 * is also what a signed-out visitor gets for an id that never existed.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const id = getRouterParam(event, 'id') ?? ''

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
      archived: true,
      currentVersion: true,
      createdAt: true,
      updatedAt: true,
      type: { select: { id: true, key: true, name: true, prefix: true, pad: true } },
      creator: { select: { name: true, position: true } },
      event: { select: { id: true, title: true, date: true } },
      attachments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, fileName: true, mime: true, size: true }
      },
      versions: {
        orderBy: { version: 'desc' },
        select: { version: true, createdAt: true }
      }
    }
  })
  if (!document || !documentIsPubliclyReadable(document)) throw notFound('Document not found')

  return {
    document: {
      ...document,
      // The public record is the current version; who filed each older one and
      // what changed is the council's own bookkeeping, not the published filing.
      versions: { current: document.currentVersion, filed: document.versions.map(v => v.version) }
    }
  }
})
