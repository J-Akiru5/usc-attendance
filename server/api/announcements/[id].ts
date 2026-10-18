import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, noContent, readJsonBody, respond } from '../../utils/http'
import { audienceColumns, parseAudience, specFromEvent } from '../../utils/audience'

/**
 * PUT/DELETE /api/announcements/:id — editing and removing.
 * A sent announcement is a record of something people received: it is immutable
 * here on purpose (write a correction instead of rewriting history).
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  requireStaff(user)

  const id = getRouterParam(event, 'id') ?? ''
  const existing = await prisma.announcement.findUnique({ where: { id } })
  if (!existing) throw new HttpError(404, 'Announcement not found')

  if (getMethod(event) === 'DELETE') {
    if (existing.status === 'sent') throw new HttpError(409, 'A sent announcement is a record — it cannot be deleted')
    await prisma.announcement.delete({ where: { id } })
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'announcement_deleted', details: JSON.stringify({ announcementId: id }), performedBy: user.id }
    })
    return noContent(event, 204)
  }

  if (getMethod(event) === 'PUT') {
    const body = await readJsonBody(event) ?? {}

    // A sent announcement is a record: its words are frozen, but pinning is a
    // display choice and may still change.
    if (existing.status === 'sent') {
      const touchesContent = body.title !== undefined || body.body !== undefined
        || body.scheduledFor !== undefined || body.audienceType !== undefined
        || body.audienceCollegeId !== undefined || body.audienceYearLevel !== undefined || body.audienceSectionId !== undefined
      if (touchesContent) throw new HttpError(409, 'A sent announcement cannot be edited — send a correction instead')

      const pinned = await prisma.announcement.update({ where: { id }, data: { pinned: body.pinned === true } })
      return pinned
    }

    const title = body.title === undefined ? existing.title : String(body.title).trim()
    const text = body.body === undefined ? existing.body : String(body.body).trim()
    if (title.length < 3 || title.length > 160) throw badRequest('A title is needed (3–160 characters)')
    if (text.length < 3 || text.length > 8000) throw badRequest('A message is needed (3–8000 characters)')

    const audience = await parseAudience(prisma, body, specFromEvent(existing))

    let scheduledFor = existing.scheduledFor
    if (body.scheduledFor !== undefined) {
      scheduledFor = body.scheduledFor === null || body.scheduledFor === '' ? null : new Date(String(body.scheduledFor))
      if (scheduledFor && Number.isNaN(scheduledFor.getTime())) throw badRequest('scheduledFor is not a valid date and time')
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        title,
        body: text,
        ...(body.pinned !== undefined && { pinned: body.pinned === true }),
        scheduledFor,
        status: scheduledFor ? 'scheduled' : 'draft',
        ...audienceColumns(audience)
      }
    })

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'announcement_updated', details: JSON.stringify({ announcementId: id, status: updated.status }), performedBy: user.id }
    })

    return updated
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
