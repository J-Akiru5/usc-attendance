import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { defineApiHandler, HttpError, readJsonBody, respond } from '../../../utils/http'
import { dispatchAnnouncement, emailBudgetError } from '../../../utils/announce'
import { resolveAudience, specFromEvent } from '../../../utils/audience'
import { emailQuota } from '../../../utils/email-quota'

/**
 * POST /api/announcements/:id/send — send a draft or a scheduled announcement
 * right now (staff). Sending twice is harmless: the delivery carries a dedupe
 * key per announcement, so a second attempt reports duplicates instead of
 * telling everyone again. Email is opt-in (D-08) and is refused outright when
 * the audience is larger than the day's remaining budget.
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
    const [audience, quota] = await Promise.all([
      resolveAudience(prisma, specFromEvent(existing)),
      emailQuota(prisma)
    ])
    const refusal = emailBudgetError(audience.length, quota.remaining)
    if (refusal) throw new HttpError(409, refusal)
  }

  const outcome = await dispatchAnnouncement(prisma, existing, { email: wantsEmail })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'announcement_sent',
      details: JSON.stringify({ announcementId: id, email: wantsEmail, ...outcome }),
      performedBy: user.id
    }
  })

  return { announcement: { id, status: 'sent', sentAt: new Date().toISOString() }, dispatch: outcome }
})
