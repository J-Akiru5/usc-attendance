import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../_lib/supabase'
import { prisma } from '../_lib/prisma'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return res.status(401).json({ error: error.message })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: data.user.id },
    })

    if (!dbUser) {
      return res.status(401).json({ error: 'User not found in database' })
    }

    return res.status(200).json({
      session: data.session,
      user: dbUser,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return res.status(500).json({ error: message })
  }
}
