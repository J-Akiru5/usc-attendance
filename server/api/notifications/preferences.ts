import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, readJsonBody, respond } from '../../utils/http'
import { DEFAULT_CHANNELS } from '../../utils/notify'

/**
 * GET/PUT /api/notifications/preferences — the caller's own channel choices
 * (plan §8.4). A missing row means the defaults, so every user has preferences
 * without a migration for existing accounts.
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const method = getMethod(event)

  if (method === 'GET') {
    const row = await prisma.notificationPreference.findUnique({ where: { userId: user.id } })
    return {
      preferences: row
        ? { inApp: row.inApp, email: row.email, push: row.push, updatedAt: row.updatedAt }
        : { ...DEFAULT_CHANNELS, updatedAt: null }
    }
  }

  if (method === 'PUT') {
    const body = await readJsonBody(event) ?? {}
    const data = {
      ...(typeof body.inApp === 'boolean' && { inApp: body.inApp }),
      ...(typeof body.email === 'boolean' && { email: body.email }),
      ...(typeof body.push === 'boolean' && { push: body.push })
    }

    const row = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...DEFAULT_CHANNELS, ...data },
      update: data
    })

    return { preferences: { inApp: row.inApp, email: row.email, push: row.push, updatedAt: row.updatedAt } }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
