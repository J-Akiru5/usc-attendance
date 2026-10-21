import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../utils/http'
import { deriveStatus, dispatchAnnouncement, renderAnnouncementBody } from '../../utils/announce'
import { resolveAudience, specFromEvent, audienceColumns, parseAudience } from '../../utils/audience'
import { emailBudgetDecision, tryEmailQuota } from '../../utils/email-quota'
import { auditContext, auditWrite } from '../../utils/audit'

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

    // D-08: email is opt-in. BC-12: an email send that would exceed today's
    // remaining budget is refused with the numbers, before anything is written
    // (so a refusal leaves no half-sent announcement) or queued.
    const wantsEmail = body.sendEmail === true
    if (status === 'sent' && wantsEmail) {
      const [recipients, quota] = await Promise.all([
        resolveAudience(prisma, audience),
        tryEmailQuota(prisma)
      ])
      const decision = emailBudgetDecision(recipients.length, quota)
      if (!decision.allowed) {
        await auditWrite(prisma, {
          actor: user,
          action: 'announcement_email_refused',
          targetType: 'announcement',
          details: {
            reason: decision.state,
            audience: audience.type,
            recipients: decision.recipients,
            remaining: decision.remaining,
            limit: decision.limit
          },
          ...auditContext(event)
        })
        throw new HttpError(409, decision.message ?? 'That email would exceed today\'s remaining budget')
      }
    }

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

    await auditWrite(prisma, {
      actor: user,
      action: status === 'sent' ? 'announcement_sent' : 'announcement_created',
      targetType: 'announcement',
      targetId: created.id,
      details: { status, audience: audience.type },
      ...auditContext(event)
    })

    if (status === 'sent') {
      const outcome = await dispatchAnnouncement(prisma, created, { email: wantsEmail })
      return respond(event, 201, { announcement: { ...created, status: 'sent' }, dispatch: outcome })
    }

    return respond(event, 201, { announcement: created })
  }

  return respond(event, 405, { error: 'Method not allowed' })
})

export { specFromEvent }
