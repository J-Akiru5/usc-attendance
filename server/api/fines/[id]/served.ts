import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { clearanceState } from '../../../utils/fines'
import { notifier, notifyUser } from '../../../utils/notify'
import { auditContext, auditWrite } from '../../../utils/audit'

/**
 * POST /api/fines/:id/served — record that a **service** sanction was carried
 * out (D-01). Service is an obligation, not money: it is closed here rather than
 * paid, and clearance treats it exactly like an unpaid fine until it is.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const fineId = getRouterParam(event, 'id') ?? ''
  const fine = await prisma.fine.findUnique({
    where: { id: fineId },
    include: { event: { select: { title: true } } }
  })
  if (!fine) throw new HttpError(404, 'Fine not found')

  if (fine.sanctionType !== 'service') {
    throw new HttpError(409, fine.sanctionType === 'monetary'
      ? 'That sanction is settled with money, not service — record a payment instead.'
      : 'That was a warning; there is nothing to serve.')
  }
  if (fine.servedAt) throw new HttpError(409, 'That service has already been recorded')
  if (fine.status !== 'unpaid') throw new HttpError(409, 'That sanction is no longer open')

  const body = await readJsonBody(event) ?? {}
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null

  const served = await prisma.fine.update({
    where: { id: fineId },
    data: { servedAt: new Date(), servedBy: user.id, servedNote: note }
  })

  await auditWrite(prisma, {
    actor: user,
    action: 'fine_served',
    targetType: 'fine',
    targetId: fineId,
    userId: fine.userId,
    details: { eventId: fine.eventId, note },
    ...auditContext(event)
  })

  await notifyUser(notifier(prisma), {
    userId: fine.userId,
    kind: 'fine_served',
    title: 'Your service was recorded',
    body: `The council recorded the service for ${fine.event?.title ?? 'the event'}.${note ? ` Note: ${note}.` : ''}`,
    link: '/fines'
  }).catch(() => {})

  const others = await prisma.fine.findMany({ where: { userId: fine.userId }, select: { status: true, sanctionType: true, amountCentavos: true, servedAt: true } })
  return { fine: { id: served.id, servedAt: served.servedAt }, standing: clearanceState(others) }
})
