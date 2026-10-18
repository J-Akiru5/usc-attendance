import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { emailQuota } from '../../utils/email-quota'
import { requireSettingsManager } from '../../utils/retention'

// ---------------------------------------------------------------------------
// GET /api/settings/email-quota — today's outbound email budget (settings
// managers). Counts only; the recipients are never stored (plan §11.1).
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const actor = await authenticate(event)
  requireSettingsManager(actor)

  return emailQuota(prisma)
})
