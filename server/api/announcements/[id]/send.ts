import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { defineApiHandler, HttpError, respond } from '../../../utils/http'
import { dispatchAnnouncement } from '../../../utils/announce'

/**
 * POST /api/announcements/:id/send — send a draft or a scheduled announcement
 * right now (staff). Sending twice is harmless: the delivery carries a dedupe
 * key per announcement, so a second attempt reports duplicates instead of
 * telling everyone again.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const id = getRouterParam(event, 'id') ?? ''
  const existing = await prisma.announcement.findUnique({ where: { id } })
  if (!existing) throw new HttpError(404, 'Announcement not found')
  if (existing.status === 'cancelled') throw new HttpError(409, 'This announcement was cancelled')

  const outcome = await dispatchAnnouncement(prisma, existing)

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'announcement_sent',
      details: JSON.stringify({ announcementId: id, ...outcome }),
      performedBy: user.id
    }
  })

  return { announcement: { id, status: 'sent', sentAt: new Date().toISOString() }, dispatch: outcome }
})
