import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { requireEventScope } from '../../utils/delegation'

/**
 * GET /api/excuses?status=pending&eventId= — the review queue (plan §8.5).
 * Staff see everything; a `view_roster` delegate sees one event's requests.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : 'pending'
  const eventId = typeof query.eventId === 'string' ? query.eventId : ''

  if (eventId) {
    await requireEventScope(prisma, user, eventId, 'view_roster')
  } else {
    requireStaff(user)
  }

  const excuses = await prisma.excuse.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(eventId ? { fine: { eventId } } : {})
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: {
      student: { select: { id: true, name: true, studentProfile: { select: { studentNo: true } } } },
      fine: {
        select: {
          id: true,
          kind: true,
          amountCentavos: true,
          status: true,
          event: { select: { id: true, title: true, date: true } }
        }
      }
    }
  })

  return {
    excuses: excuses.map(excuse => ({
      ...excuse,
      hasAttachment: !!excuse.attachmentKey
    }))
  }
})
