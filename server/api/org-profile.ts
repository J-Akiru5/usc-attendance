import { getMethod } from 'h3'
import { prisma } from '../utils/prisma'
import { authenticate } from '../utils/auth'
import { defineApiHandler, respond } from '../utils/http'

// ---------------------------------------------------------------------------
// GET /api/org-profile
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  await authenticate(event)

  let profile = await prisma.orgProfile.findFirst()
  if (!profile) {
    profile = await prisma.orgProfile.create({ data: {} })
  }

  return profile
})
