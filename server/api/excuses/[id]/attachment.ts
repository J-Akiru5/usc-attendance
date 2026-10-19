import { getMethod, getRouterParam, setResponseHeader } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { defineApiHandler, HttpError } from '../../../utils/http'
import { hasEventScope } from '../../../utils/delegation'
import { auditContext, auditRead } from '../../../utils/audit'
import { excuseStorage } from '../../../utils/excuse-storage'

/**
 * GET /api/excuses/:id/attachment — the uploaded document, for its owner or for
 * roster staff reviewing it. Bytes come from object storage, never the database.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') throw new HttpError(405, 'Method not allowed')

  const user = await authenticate(event)
  const id = getRouterParam(event, 'id') ?? ''

  const excuse = await prisma.excuse.findUnique({
    where: { id },
    select: {
      userId: true,
      attachmentKey: true,
      attachmentMime: true,
      fine: { select: { eventId: true } }
    }
  })
  if (!excuse) throw new HttpError(404, 'Excuse not found')
  if (!excuse.attachmentKey) throw new HttpError(404, 'This excuse has no attachment')

  if (excuse.userId !== user.id) {
    const { allowed } = await hasEventScope(prisma, user, excuse.fine.eventId, 'view_roster')
    if (!allowed) throw new HttpError(403, 'Access denied')
  }

  const store = excuseStorage()
  if (!store) throw new HttpError(503, 'Attachment storage is not configured')

  const bytes = await store.get(excuse.attachmentKey)
  // BC-10: the evidence was read, so the reader is recorded. The row names the
  // excuse and whether the reader was its owner; it never names the document.
  await auditRead(prisma, {
    actor: user,
    action: 'excuse_attachment_viewed',
    targetType: 'excuse',
    targetId: id,
    userId: excuse.userId,
    details: { surface: 'excuse_attachment', owner: excuse.userId === user.id },
    ...auditContext(event)
  })
  setResponseHeader(event, 'Content-Type', excuse.attachmentMime ?? 'application/octet-stream')
  setResponseHeader(event, 'Cache-Control', 'private, max-age=60')
  return bytes
})
