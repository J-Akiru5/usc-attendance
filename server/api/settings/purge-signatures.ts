import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { requireSettingsManager } from '../../utils/retention'
import { runSignaturePurge } from '../../utils/purge'

// ---------------------------------------------------------------------------
// POST /api/settings/purge-signatures — run the retention purge now (settings managers)
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireSettingsManager(actor)
  return runSignaturePurge(prisma, actor.id)
})
