import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { dispatchAnnouncement } from '../../../utils/announce'
import { resolveAudience, specFromEvent } from '../../../utils/audience'
import { emailBudgetDecision, tryEmailQuota } from '../../../utils/email-quota'
import { auditContext, auditWrite } from '../../../utils/audit'

/**
 * POST /api/announcements/:id/send — send a draft or a scheduled announcement
 * right now (staff). Sending twice is harmless: the delivery carries a dedupe
 * key per announcement, so a second attempt reports duplicates instead of
 * telling everyone again. Email is opt-in (D-08) and is refused outright when
 * the audience is larger than the day's remaining budget, or when that budget
 * cannot be read reliably — the refusal names the numbers and is audited.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const id = getRouterParam(event, 'id') ?? ''
  const existing = await prisma.announcement.findUnique({ where: { id } })
  if (!existing) throw new HttpError(404, 'Announcement not found')
  if (existing.status === 'cancelled') throw new HttpError(409, 'This announcement was cancelled')

  const body = await readJsonBody(event) ?? {}
  const wantsEmail = body.sendEmail === true
  if (wantsEmail) {
    const [recipients, quota] = await Promise.all([
      resolveAudience(prisma, specFromEvent(existing)),
      tryEmailQuota(prisma)
    ])
    const decision = emailBudgetDecision(recipients.length, quota)
    if (!decision.allowed) {
      await auditWrite(prisma, {
        actor: user,
        action: 'announcement_email_refused',
        targetType: 'announcement',
        targetId: id,
        details: {
          reason: decision.state,
          audience: existing.audienceType,
          recipients: decision.recipients,
          remaining: decision.remaining,
          limit: decision.limit
        },
        ...auditContext(event)
      })
      throw new HttpError(409, decision.message ?? 'That email would exceed today\'s remaining budget')
    }
  }

  const outcome = await dispatchAnnouncement(prisma, existing, { email: wantsEmail })

  await auditWrite(prisma, {
    actor: user,
    action: 'announcement_sent',
    targetType: 'announcement',
    targetId: id,
    details: { email: wantsEmail, ...outcome },
    ...auditContext(event)
  })

  return { announcement: { id, status: 'sent', sentAt: new Date().toISOString() }, dispatch: outcome }
})
