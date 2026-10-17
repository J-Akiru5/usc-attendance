import { getMethod } from 'h3'
import { prisma } from '../utils/prisma'
import { badRequest, defineApiHandler, readJsonBody, respond } from '../utils/http'

// ---------------------------------------------------------------------------
// POST /api/contact
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const { name, email, message } = await readJsonBody(event) ?? {}

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
      message: message.trim()
    }
  })

  return respond(event, 201, submission)
})
