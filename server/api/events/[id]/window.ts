import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate } from '../../../utils/auth'
import { badRequest, defineApiHandler, notFound, readJsonBody, respond } from '../../../utils/http'
import { parseWindow, requireSettingsManager } from '../../../utils/retention'

// ---------------------------------------------------------------------------
// PUT /api/events/:id/window   { checkInOpensAt, checkInClosesAt }  (null/'' clears)
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'PUT') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireSettingsManager(actor)

  const id = getRouterParam(event, 'id') ?? ''
  const eventRow = await prisma.event.findUnique({ where: { id } })
  if (!eventRow) throw notFound('Event not found')
  const body = await readJsonBody(event)
  if (body === undefined || body === null) throw badRequest('Request body is required')

  const data = parseWindow(body)
  const updated = await prisma.event.update({
    where: { id },
    data,
    select: { id: true, checkInOpensAt: true, checkInClosesAt: true }
  })
  await prisma.auditLog.create({
    data: {
      userId: null,
      action: 'checkin_window_set',
      details: JSON.stringify({ eventId: id, opens: data.checkInOpensAt, closes: data.checkInClosesAt }),
      performedBy: actor.id
    }
  })
  return updated
})
