import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { parseAudience, resolveAudience } from '../../utils/audience'
import { emailBudgetDecision, quotaView, tryEmailQuota } from '../../utils/email-quota'

/**
 * GET /api/announcements/preview — what choosing email would cost (BC-12,
 * plan §8.4). Staff only, and deliberately a *count*: the audience is resolved
 * server-side, then only its size is returned. No recipient ids, names or
 * addresses ever leave this route.
 *
 * The same decision helper the send paths use is returned alongside, so the
 * composer and the server cannot disagree about whether a send fits.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const spec = await parseAudience(prisma, { ...getQuery(event) } as Record<string, unknown>)
  const [recipients, quota] = await Promise.all([
    resolveAudience(prisma, spec),
    tryEmailQuota(prisma)
  ])

  const decision = emailBudgetDecision(recipients.length, quota)

  return {
    audience: spec,
    eligible: recipients.length,
    quota: quotaView(quota),
    budget: {
      state: decision.state,
      allowed: decision.allowed,
      message: decision.message
    }
  }
})
