import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { waiverFor } from '../../../utils/excuses'
import { notifyUser, notifier } from '../../../utils/notify'

/**
 * POST /api/excuses/:id/review — approve (which waives the fine) or deny
 * (plan §8.5). Staff only. A paid fine cannot be waived, and an already-reviewed
 * excuse cannot be reviewed twice.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const id = getRouterParam(event, 'id') ?? ''
  const excuse = await prisma.excuse.findUnique({
    where: { id },
    include: { fine: { select: { id: true, status: true, kind: true, amountCentavos: true, event: { select: { id: true, title: true } } } } }
  })
  if (!excuse) throw new HttpError(404, 'Excuse not found')
  if (excuse.status !== 'pending') throw new HttpError(409, 'This excuse has already been reviewed')

  const body = await readJsonBody(event) ?? {}
  const decision = String(body.decision ?? '')
  if (decision !== 'approve' && decision !== 'deny') throw badRequest('decision must be "approve" or "deny"')

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null
  const now = new Date()

  if (decision === 'approve') {
    const waiver = waiverFor({ id: excuse.fine.id, status: excuse.fine.status }, user.id, note, now)
    await prisma.fine.update({ where: { id: excuse.fine.id }, data: waiver })
  }

  const reviewed = await prisma.excuse.update({
    where: { id },
    data: {
      status: decision === 'approve' ? 'approved' : 'denied',
      reviewedBy: user.id,
      reviewedAt: now,
      reviewNote: note
    }
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: decision === 'approve' ? 'excuse_approved' : 'excuse_denied',
      details: JSON.stringify({ excuseId: id, fineId: excuse.fine.id, note }),
      performedBy: user.id
    }
  })

  await notifyUser(notifier(prisma), {
    userId: excuse.userId,
    kind: decision === 'approve' ? 'excuse_approved' : 'excuse_denied',
    title: decision === 'approve' ? 'Your excuse was approved' : 'Your excuse was not accepted',
    body: decision === 'approve'
      ? `The fine for ${excuse.fine.event?.title ?? 'the event'} has been waived.`
      : `The request for ${excuse.fine.event?.title ?? 'the event'} was not accepted${note ? `: ${note}` : '.'}`,
    link: '/fines'
  }).catch(() => {})

  return { excuse: reviewed, fineStatus: decision === 'approve' ? 'waived' : excuse.fine.status }
})
