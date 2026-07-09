import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req)
    return res.status(200).json(user)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    const status = message.includes('Access denied') ? 403 : 401
    return res.status(status).json({ error: message })
  }
}
