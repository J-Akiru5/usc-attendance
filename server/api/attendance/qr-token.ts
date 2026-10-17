import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, notFound, readJsonBody, respond } from '../../utils/http'
import { issueQrToken } from '../../utils/qr'

// ---------------------------------------------------------------------------
// POST /api/attendance/qr-token  — issue a server-signed QR token (own account)
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const user = await authenticate(event)
  const { eventId } = await readJsonBody(event) ?? {}

  if (!eventId || typeof eventId !== 'string') {
    throw badRequest('eventId is required')
  }

  const eventRow = await prisma.event.findUnique({ where: { id: eventId } })
  if (!eventRow) {
    throw notFound('Event not found')
  }

  const { token, exp } = issueQrToken(user.id, eventId)
  return { token, exp }
})
