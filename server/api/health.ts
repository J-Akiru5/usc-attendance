import { getMethod } from 'h3'
import { prisma } from '../utils/prisma'
import { defineApiHandler, respond } from '../utils/http'

// ---------------------------------------------------------------------------
// GET /api/health — public, DB-backed liveness probe.
//
// Keeps Supabase awake (free projects pause after ~7 days of inactivity) and
// gives the uptime monitor something meaningful to watch. Deliberately says
// nothing about versions, users or configuration.
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const startedAt = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    console.error('[health] database check failed:', err instanceof Error ? err.message : err)
    return respond(event, 503, {
      status: 'error',
      database: 'down',
      time: new Date().toISOString()
    })
  }

  return {
    status: 'ok',
    database: 'up',
    latencyMs: Date.now() - startedAt,
    time: new Date().toISOString()
  }
})
