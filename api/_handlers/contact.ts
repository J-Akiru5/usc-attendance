import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { badRequest, handle } from '../_lib/http.js'

// ---------------------------------------------------------------------------
// POST /api/contact
// ---------------------------------------------------------------------------
export const contact = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, message } = req.body || {}

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw badRequest('Name is required')
  }
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    throw badRequest('Email is required')
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw badRequest('Message is required')
  }

  const submission = await prisma.contactSubmission.create({
    data: {
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
    },
  })

  return res.status(201).json(submission)
})
