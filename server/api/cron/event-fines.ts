import { getHeader, getMethod } from 'h3'
import { timingSafeEqual } from 'crypto'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, HttpError, respond } from '../../utils/http'
import { fineDeadline, formatPeso, planFines, resolveRule, type FineRule } from '../../utils/fines'
import { resolveAudience, specFromEvent } from '../../utils/audience'
import { notifier, notifyMany } from '../../utils/notify'

/**
 * GET /api/cron/event-fines — called daily with CRON_SECRET (plan §8.5): for
 * every past event whose check-in window has closed and whose fines have not
 * been generated yet, work out who was required, who turned up, and who owes
 * what. Idempotent by `events.finesIssuedAt` *and* by the unique (user, event)
 * index, so a retry can never double-charge anyone.
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
  const candidates = await prisma.event.findMany({
    // Cancelled events never generate fines — the whole point of BC-7: a
    // rained-out assembly must not bill everyone who stayed home.
    where: { finesIssuedAt: null, date: { lte: now }, status: 'scheduled' },
    orderBy: { date: 'asc' },
    take: 50,
    select: {
      id: true,
      title: true,
      date: true,
      checkInClosesAt: true,
      checkInOpensAt: true,
      categoryId: true,
      audienceType: true,
      audienceCollegeId: true,
      audienceYearLevel: true,
      audienceSectionId: true
    }
  })

  const globalRow = await prisma.fineRule.findFirst({ where: { scope: 'global' } })
  const asRule = (row: { absentCentavos: number, lateCentavos: number, lateAfterMinutes: number } | null): FineRule | null =>
    row ? { absentCentavos: row.absentCentavos, lateCentavos: row.lateCentavos, lateAfterMinutes: row.lateAfterMinutes } : null

  const results: Array<{ eventId: string, title: string, audience: number, absent: number, late: number, totalCentavos: number, skipped: boolean }> = []

  for (const row of candidates) {
    // Not due until the window closes (or six hours after the start).
    if (fineDeadline(row).getTime() > now.getTime()) {
      results.push({ eventId: row.id, title: row.title, audience: 0, absent: 0, late: 0, totalCentavos: 0, skipped: true })
      continue
    }

    const [categoryRow, eventRow] = await Promise.all([
      row.categoryId ? prisma.fineRule.findUnique({ where: { categoryId: row.categoryId } }) : null,
      prisma.fineRule.findUnique({ where: { eventId: row.id } })
    ])
    const rule = resolveRule(asRule(globalRow), asRule(categoryRow), asRule(eventRow))

    const audience = await resolveAudience(prisma, specFromEvent(row))
    const attendance = await prisma.attendance.findMany({
      where: { eventId: row.id },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    })

    // First time each person was seen, which is what lateness is measured from.
    const firstSeen = new Map<string, Date>()
    for (const record of attendance) {
      if (!firstSeen.has(record.userId)) firstSeen.set(record.userId, record.createdAt)
    }

    const items = planFines({
      audience,
      firstSeen,
      opensAt: row.checkInOpensAt ?? row.date,
      rule
    })

    const created = items.length > 0
      ? await prisma.fine.createMany({
          data: items.map(item => ({
            userId: item.userId,
            eventId: row.id,
            kind: item.kind,
            amountCentavos: item.amountCentavos,
            ruleSnapshot: { ...rule, scope: eventRow ? 'event' : categoryRow ? 'category' : 'global' }
          })),
          skipDuplicates: true
        })
      : { count: 0 }

    // Tell the people who owe (plan §8.4's fine-issued notification).
    if (items.length > 0) {
      await notifyMany(notifier(prisma), items.map(item => ({
        userId: item.userId,
        kind: 'fine_issued',
        title: `${item.kind === 'absent' ? 'Absence' : 'Late'} fine for ${row.title}`,
        body: `A ${formatPeso(item.amountCentavos)} fine was recorded for ${row.title}. Settle it with the Treasurer, or file an excuse if there is a reason.`,
        link: '/dashboard'
      })))
    }

    await prisma.event.update({ where: { id: row.id }, data: { finesIssuedAt: now } })
    await prisma.auditLog.create({
      data: {
        userId: row.id,
        action: 'fines_generated',
        details: JSON.stringify({ eventId: row.id, fineCount: created.count, absent: items.filter(i => i.kind === 'absent').length, late: items.filter(i => i.kind === 'late').length, rule }),
        performedBy: row.id
      }
    })

    results.push({
      eventId: row.id,
      title: row.title,
      audience: audience.length,
      absent: items.filter(i => i.kind === 'absent').length,
      late: items.filter(i => i.kind === 'late').length,
      totalCentavos: items.reduce((sum, item) => sum + item.amountCentavos, 0),
      skipped: false
    })
  }

  return {
    ranAt: now.toISOString(),
    processed: results.filter(r => !r.skipped).length,
    fines: results.reduce((sum, r) => sum + r.absent + r.late, 0),
    results
  }
})
