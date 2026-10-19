import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { excuseBlockedReason, validateAttachment, validateExcuse } from '../../../utils/excuses'
import { excuseObjectKey, excuseStorage } from '../../../utils/excuse-storage'
import { hasEventScope } from '../../../utils/delegation'
import { auditContext, auditWrite } from '../../../utils/audit'

/**
 * /api/fines/:id/excuse — the student files an excuse against their own fine
 * (plan §8.5), optionally with a medical certificate or similar.
 *   GET  the latest excuse on that fine (owner or roster staff)
 *   POST file one (owner only)
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const fineId = getRouterParam(event, 'id') ?? ''

  const fine = await prisma.fine.findUnique({
    where: { id: fineId },
    include: { event: { select: { id: true, title: true } } }
  })
  if (!fine) throw new HttpError(404, 'Fine not found')

  const method = getMethod(event)

  if (method === 'GET') {
    if (fine.userId !== user.id) {
      const { allowed } = await hasEventScope(prisma, user, fine.eventId, 'view_roster')
      if (!allowed) throw new HttpError(403, 'Access denied')
    }
    const latest = await prisma.excuse.findFirst({
      where: { fineId },
      orderBy: { createdAt: 'desc' },
      include: { reviewer: { select: { id: true, name: true } } }
    })
    return { fine: { id: fine.id, kind: fine.kind, amountCentavos: fine.amountCentavos, status: fine.status }, excuse: latest }
  }

  if (method !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  if (fine.userId !== user.id) throw new HttpError(403, 'You can only file an excuse for your own fine')

  const existing = await prisma.excuse.findMany({ where: { fineId }, select: { status: true } })
  const blocked = excuseBlockedReason(fine, existing)
  if (blocked) throw new HttpError(409, blocked)

  const body = await readJsonBody(event) ?? {}
  const input = validateExcuse(body)

  // The attachment is optional; when sent it goes to object storage (never the DB).
  let attachment: { key: string, mime: string, size: number } | null = null
  if (body.attachment && typeof body.attachment === 'object') {
    const attachmentBody = body.attachment as { mime?: unknown, dataBase64?: unknown }
    const data = typeof attachmentBody.dataBase64 === 'string' ? attachmentBody.dataBase64 : ''
    if (!data) throw badRequest('attachment.dataBase64 is required when an attachment is sent')
    const bytes = Buffer.from(data, 'base64')
    const checked = validateAttachment(attachmentBody.mime, bytes.length)
    if (!checked) throw badRequest('attachment needs a mime type')

    const store = excuseStorage()
    if (!store) throw badRequest('Attachments are not configured in this environment — file the excuse without one')

    const id = crypto.randomUUID()
    const key = excuseObjectKey(id, checked.mime)
    await store.put(key, new Uint8Array(bytes), checked.mime)
    attachment = { key, mime: checked.mime, size: checked.size }
    void id
  }

  const excuse = await prisma.excuse.create({
    data: {
      fineId,
      userId: user.id,
      category: input.category,
      reason: input.reason,
      ...(attachment && {
        attachmentKey: attachment.key,
        attachmentMime: attachment.mime,
        attachmentSize: attachment.size
      })
    }
  })

  await auditWrite(prisma, {
    actor: user,
    action: 'excuse_filed',
    targetType: 'excuse',
    targetId: excuse.id,
    userId: user.id,
    details: { fineId, category: input.category, hasAttachment: !!attachment },
    ...auditContext(event)
  })

  return respond(event, 201, { excuse })
})
