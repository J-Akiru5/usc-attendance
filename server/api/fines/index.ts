import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { requireEventScope } from '../../utils/delegation'
import { totalCentavos, formatPeso } from '../../utils/fines'

/**
 * GET /api/fines?eventId=&status=&userId= — the council's view of what is owed
 * (plan §8.5): staff see everything, a `view_roster` delegate sees one event's.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const query = getQuery(event)
  const eventId = typeof query.eventId === 'string' ? query.eventId : ''
  const status = typeof query.status === 'string' ? query.status : ''
  const userId = typeof query.userId === 'string' ? query.userId : ''

  if (eventId) {
    await requireEventScope(prisma, user, eventId, 'view_roster')
  } else {
    requireStaff(user)
  }

  const fines = await prisma.fine.findMany({
    where: {
      ...(eventId ? { eventId } : {}),
      ...(status ? { status } : {}),
      ...(userId ? { userId } : {})
    },
    orderBy: [{ issuedAt: 'desc' }],
    take: 500,
    include: {
      user: { select: { id: true, name: true, studentProfile: { select: { studentNo: true, yearLevel: true } } } },
      event: { select: { id: true, title: true, date: true } }
    }
  })

  return {
    fines,
    summary: {
      count: fines.length,
      unpaid: fines.filter(f => f.status === 'unpaid').length,
      unpaidCentavos: totalCentavos(fines),
      unpaidPesos: formatPeso(totalCentavos(fines)),
      paidCentavos: totalCentavos(fines, false) - totalCentavos(fines),
      waived: fines.filter(f => f.status === 'waived').length
    }
  }
})
