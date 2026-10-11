import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate } from '../_lib/auth.js'
import { handle } from '../_lib/http.js'

// ---------------------------------------------------------------------------
// GET /api/org-profile
// ---------------------------------------------------------------------------
export const orgProfile = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  await authenticate(req)

  let profile = await prisma.orgProfile.findFirst()
  if (!profile) {
    profile = await prisma.orgProfile.create({ data: {} })
  }

  return res.status(200).json(profile)
})
