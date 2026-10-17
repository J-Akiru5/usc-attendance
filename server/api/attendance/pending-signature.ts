import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { SIGN_WINDOW_MS } from '../../utils/signature'

// ---------------------------------------------------------------------------
// GET /api/attendance/pending-signature
// Event check-ins of the signed-in person that still need their signature.
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })
  const user = await authenticate(event)

  const records = await prisma.attendance.findMany({
    where: {
      userId: user.id,
      type: 'event',
      createdAt: { gt: new Date(Date.now() - SIGN_WINDOW_MS) },
      signature: { is: null }
    },
    select: { id: true, eventId: true, createdAt: true, event: { select: { title: true } } },
    orderBy: { createdAt: 'desc' }
  })

  return records.map(r => ({ id: r.id, eventId: r.eventId, eventTitle: r.event?.title ?? '', createdAt: r.createdAt }))
})
