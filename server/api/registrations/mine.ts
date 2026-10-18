import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { seatsLeft } from '../../utils/registrations'

/**
 * GET /api/registrations/mine — the caller's own registrations (plan §8.2),
 * newest first, so a student can see where they stand.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)

  const rows = await prisma.eventRegistration.findMany({
    where: { userId: user.id, status: { in: ['registered', 'waitlisted'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      promotedAt: true,
      event: {
        select: {
          id: true,
          title: true,
          date: true,
          capacity: true,
          category: { select: { id: true, code: true, name: true, color: true } }
        }
      }
    }
  })

  const withSeats = await Promise.all(rows.map(async (row) => {
    const registered = await prisma.eventRegistration.count({ where: { eventId: row.event.id, status: 'registered' } })
    return { ...row, seatsLeft: seatsLeft(row.event.capacity, registered) }
  }))

  return withSeats
})
