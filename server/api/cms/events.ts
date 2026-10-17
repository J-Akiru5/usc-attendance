import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET /api/cms/events
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const cmsEvents = await prisma.publicEvent.findMany({
    orderBy: { date: 'desc' }
  })

  return cmsEvents
})
