import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../utils/http'
import { deriveStatus, dispatchAnnouncement, emailBudgetError, renderAnnouncementBody } from '../../utils/announce'
import { resolveAudience, specFromEvent, audienceColumns, parseAudience } from '../../utils/audience'
import { emailQuota } from '../../utils/email-quota'

import { dedupeKeyFor } from '../../utils/notify'

/**
 * GET  /api/announcements — the council's list with how many people each one
 *                          reached (staff only: it is a management view).
 * POST /api/announcements — write one: a draft, a scheduled send, or send now.
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  requireStaff(user)
  const method = getMethod(event)

  if (method === 'GET') {
    const query = getQuery(event)
    const status = typeof query.status === 'string' ? query.status : ''

    const items = await prisma.announcement.findMany({
      where: status ? { status } : {},
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        creator: { select: { id: true, name: true } },
        audienceCollege: { select: { id: true, code: true, name: true } },
        audienceSection: { select: { id: true, name: true } }
      }
    })

    const counts = items.length > 0
      ? await prisma.notification.groupBy({
          by: ['dedupeKey'],
          where: { kind: 'announcement', dedupeKey: { in: items.map(item => dedupeKeyFor('announcement', item.id)) } },
          _count: { _all: true }
        })
      : []
    const reached = new Map(counts.map(row => [row.dedupeKey ?? '', row._count._all]))

    return {
      items: items.map(item => ({
        ...item,
        reached: reached.get(dedupeKeyFor('announcement', item.id)) ?? 0,
        preview: renderAnnouncementBody(item.body)
      }))
    }
  }

  if (method === 'POST') {
    const body = await readJsonBody(event) ?? {}
    const title = String(body.title ?? '').trim()
    const text = String(body.body ?? '').trim()
    if (title.length < 3 || title.length > 160) throw badRequest('A title is needed (3–160 characters)')
    if (text.length < 3 || text.length > 8000) throw badRequest('A message is needed (3–8000 characters)')

    const audience = await parseAudience(prisma, body)

    const scheduledFor = body.scheduledFor ? new Date(String(body.scheduledFor)) : null
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) throw badRequest('scheduledFor is not a valid date and time')
    const status = deriveStatus({ sendNow: body.sendNow === true, scheduledFor })

    const created = await prisma.announcement.create({
      data: {
        title,
        body: text,
        pinned: body.pinned === true,
        status,
        scheduledFor,
        createdBy: user.id,
        ...audienceColumns(audience)
      }
    })

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: status === 'sent' ? 'announcement_sent' : 'announcement_created',
        details: JSON.stringify({ announcementId: created.id, status, audience: audience.type }),
        performedBy: user.id
      }
    })

    if (status === 'sent') {
      // D-08: email is opt-in, and a send that exceeds today's remaining budget
      // is refused with the options spelled out rather than quietly downgraded.
      const wantsEmail = body.sendEmail === true
      if (wantsEmail) {
        const [audience, quota] = await Promise.all([
          resolveAudience(prisma, specFromEvent(created)),
          emailQuota(prisma)
        ])
        const refusal = emailBudgetError(audience.length, quota.remaining)
        if (refusal) throw new HttpError(409, refusal)
      }
      const outcome = await dispatchAnnouncement(prisma, created, { email: wantsEmail })
      return respond(event, 201, { announcement: { ...created, status: 'sent' }, dispatch: outcome })
    }

    return respond(event, 201, { announcement: created })
  }

  return respond(event, 405, { error: 'Method not allowed' })
})

export { specFromEvent }
