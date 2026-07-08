import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate } from '../_lib/auth'
import { prisma } from '../_lib/prisma'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req)
    const { name, position } = req.body

    if (!name || !position) {
      return res.status(400).json({ error: 'Name and position are required' })
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        position
      }
    })

    return res.status(200).json({
      user: updatedUser
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return res.status(500).json({ error: message })
  }
}
