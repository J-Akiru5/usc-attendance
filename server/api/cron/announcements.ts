import { getHeader, getMethod } from 'h3'
import { timingSafeEqual } from 'crypto'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, HttpError, respond } from '../../utils/http'
import { dispatchAnnouncement, dueAnnouncements } from '../../utils/announce'
import { auditWrite } from '../../utils/audit'

/**
 * GET /api/cron/announcements — called every few minutes with CRON_SECRET
 * (plan §8.4): sends whatever was scheduled and is now due. Idempotent twice
 * over — only `scheduled` rows past their time are picked, and each delivery
 * carries `announcement:<id>`, so a retry reports duplicates rather than sending
 * again.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const secret = process.env.CRON_SECRET
  if (!secret) throw new HttpError(503, 'CRON_SECRET is not configured')
  const given = Buffer.from(getHeader(event, 'authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, 'Unauthorized')
  }

  const now = new Date()
  const candidates = await prisma.announcement.findMany({
    where: { status: 'scheduled', scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    take: 20
  })

  const due = dueAnnouncements(candidates, now)
  const results: Array<{ id: string, title: string, recipients: number, sent: number, duplicates: number, emails: number }> = []

  for (const row of due) {
    // Scheduled announcements are inbox-first (D-08): nobody is at the keyboard
    // to weigh the quota, so email is not attempted from the scheduler.
    const outcome = await dispatchAnnouncement(prisma, row, { now, email: false })
    results.push({ id: row.id, title: row.title, ...outcome })
    await auditWrite(prisma, {
      // The scheduler is the actor; the announcement is the target.
      actor: null,
      action: 'announcement_sent',
      targetType: 'announcement',
      targetId: row.id,
      details: { by: 'cron', email: false, ...outcome }
    })
  }

  return { ranAt: now.toISOString(), due: due.length, results }
})
