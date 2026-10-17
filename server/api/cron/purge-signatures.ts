import { timingSafeEqual } from 'crypto'
import { getHeader, getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, HttpError, respond } from '../../utils/http'
import { runSignaturePurge } from '../../utils/purge'

// ---------------------------------------------------------------------------
// GET /api/cron/purge-signatures — called daily by the scheduler with CRON_SECRET
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })
  const secret = process.env.CRON_SECRET
  if (!secret) throw new HttpError(503, 'CRON_SECRET is not configured')

  const given = Buffer.from(getHeader(event, 'authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new HttpError(401, 'Unauthorized')
  }
  return runSignaturePurge(prisma, null)
})
