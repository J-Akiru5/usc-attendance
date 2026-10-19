import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, readJsonBody, respond } from '../../utils/http'
import { FINANCE_READ_CAPABILITIES, optionalText } from '../../utils/finance'
import { getFinanceSettings } from '../../utils/finance-data'
import { requireAnyCapability } from '../../utils/rbac'

/**
 * /api/settings/transparency — the switch behind the public transparency board
 * (plan §8.7: "read-only, summary-only, behind an explicit toggle so the council
 * can switch it on later").
 *
 *   GET  the current setting (a finance officer, or a settings manager)
 *   PUT  turn it on or off, with an optional public note
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  const method = getMethod(event)

  if (method === 'GET') {
    requireAnyCapability(user, [...FINANCE_READ_CAPABILITIES, 'settings.manage'])
    const settings = await getFinanceSettings(prisma)
    return {
      transparencyPublic: settings.transparencyPublic,
      transparencyNote: settings.transparencyNote,
      updatedAt: settings.updatedAt
    }
  }

  if (method !== 'PUT') return respond(event, 405, { error: 'Method not allowed' })
  requireAnyCapability(user, ['finance.manage', 'settings.manage'])

  const body = await readJsonBody(event) ?? {}
  if (typeof body.transparencyPublic !== 'boolean') {
    throw badRequest('transparencyPublic must be true or false')
  }
  const note = optionalText(body.transparencyNote, 'The public note', 300)

  const current = await getFinanceSettings(prisma)
  const updated = await prisma.financeSettings.update({
    where: { id: current.id },
    data: { transparencyPublic: body.transparencyPublic, transparencyNote: note, updatedBy: user.id }
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'finance_transparency_changed',
      details: JSON.stringify({ from: current.transparencyPublic, to: updated.transparencyPublic, note }),
      performedBy: user.id
    }
  })

  return {
    transparencyPublic: updated.transparencyPublic,
    transparencyNote: updated.transparencyNote,
    updatedAt: updated.updatedAt
  }
})
