import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { requireCapability } from '../../../utils/rbac'
import { defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { formatPeso } from '../../../utils/fines'
import { paymentBlockedReason, validatePayment } from '../../../utils/payments'
import { notifier, notifyUser } from '../../../utils/notify'

/**
 * POST /api/fines/:id/payment — the Treasurer records a settlement (plan §8.5):
 * cash (OR number) or GCash (reference). One payment settles the fine in full,
 * and a fine that is paid or waived cannot be settled again.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  // D-06: recording money needs the finance capability (in practice the
  // Treasurer, or the President when they are away) — not merely "staff".
  requireCapability(user, 'finance.manage')

  const fineId = getRouterParam(event, 'id') ?? ''
  const fine = await prisma.fine.findUnique({
    where: { id: fineId },
    include: { event: { select: { title: true } } }
  })
  if (!fine) throw new HttpError(404, 'Fine not found')

  // D-01: a service sanction is not settled with money; it is served.
  if (fine.sanctionType === 'service') {
    throw new HttpError(409, 'This is a service sanction, not a fine — mark it served when the service is done.')
  }
  if (fine.sanctionType === 'warning') {
    throw new HttpError(409, 'That was a warning; nothing is owed on it.')
  }

  const blocked = paymentBlockedReason(fine)
  if (blocked) throw new HttpError(409, blocked)

  const body = await readJsonBody(event) ?? {}
  const input = validatePayment(body, fine)

  const payment = await prisma.payment.create({
    data: {
      fineId,
      userId: fine.userId,
      amountCentavos: input.amountCentavos,
      method: input.method,
      reference: input.reference,
      note: input.note,
      receivedBy: user.id
    }
  })

  await prisma.fine.update({
    where: { id: fineId },
    data: { status: 'paid', paidAt: payment.receivedAt, paidBy: user.id, paymentRef: input.reference }
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'payment_recorded',
      details: JSON.stringify({ fineId, paymentId: payment.id, amountCentavos: input.amountCentavos, method: input.method, reference: input.reference }),
      performedBy: user.id
    }
  })

  const remaining = await prisma.fine.findMany({ where: { userId: fine.userId }, select: { amountCentavos: true, status: true } })
  const unpaid = remaining.reduce((sum, row) => sum + (row.status === 'unpaid' ? row.amountCentavos : 0), 0)

  await notifyUser(notifier(prisma), {
    userId: fine.userId,
    kind: 'payment_recorded',
    title: `Payment received — ${formatPeso(input.amountCentavos)}`,
    body: unpaid === 0
      ? `Your fine for ${fine.event?.title ?? 'the event'} is settled and you are cleared. You can ask the council for your clearance certificate.`
      : `Your fine for ${fine.event?.title ?? 'the event'} is settled. ${formatPeso(unpaid)} is still outstanding on your account.`,
    link: '/fines'
  }).catch(() => {})

  return respond(event, 201, {
    payment,
    fine: { id: fineId, status: 'paid' },
    account: { unpaidCentavos: unpaid, unpaidPesos: formatPeso(unpaid), cleared: unpaid === 0 }
  })
})
