import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { requireSettingsManager } from '../../utils/retention'
import { AUDIT_HEALTH_ROW_LIMIT, buildAuditHealth } from '../../utils/audit-health'

const DAY_MS = 86_400_000

/**
 * GET /api/settings/audit-health — is the audit log still being written?
 * (plan §11.2, benchmark BC-10).
 *
 * Settings managers only: the action names are operational metadata, not
 * personal data, but the shape of activity is still internal. The endpoint
 * counts the last 24 h and 7 days by action and reports "silent gaps" — an
 * action that ran on each of the previous three days and has not run today.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireSettingsManager(user)

  const now = new Date()
  const rows = await prisma.auditLog.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
    select: { action: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    // One extra row lets the summary say the counts were truncated instead of
    // silently reporting a partial total on an unusually busy week.
    take: AUDIT_HEALTH_ROW_LIMIT + 1
  })

  return buildAuditHealth(rows, now)
})
