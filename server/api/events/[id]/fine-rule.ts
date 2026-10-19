import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { defineApiHandler, noContent, notFound, readJsonBody, respond } from '../../../utils/http'
import { DEFAULT_FINE_RULE, formatPeso, validateRule, type FineRule } from '../../../utils/fines'
import { auditContext, auditWrite } from '../../../utils/audit'

/**
 * GET/PUT/DELETE /api/events/:id/fine-rule — a single event's override of the
 * fine rates (plan §8.5). DELETE removes it, so the category or global rule
 * applies again.
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  requireStaff(user)

  const eventId = getRouterParam(event, 'id') ?? ''
  const eventRow = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, categoryId: true } })
  if (!eventRow) throw notFound('Event not found')

  const findRule = () => prisma.fineRule.findUnique({ where: { eventId } })
  const asRule = (row: { absentCentavos: number, lateCentavos: number, lateAfterMinutes: number, sanctionType?: string, authorityRef?: string | null, effectiveFrom?: Date | null } | null): FineRule | null =>
    row
      ? {
          absentCentavos: row.absentCentavos,
          lateCentavos: row.lateCentavos,
          lateAfterMinutes: row.lateAfterMinutes,
          sanctionType: (row.sanctionType ?? 'warning') as FineRule['sanctionType'],
          authorityRef: row.authorityRef ?? null,
          effectiveFrom: row.effectiveFrom ?? null
        }
      : null

  if (getMethod(event) === 'GET') {
    const [own, categoryRule, globalRule] = await Promise.all([
      findRule(),
      eventRow.categoryId ? prisma.fineRule.findUnique({ where: { categoryId: eventRow.categoryId } }) : null,
      prisma.fineRule.findFirst({ where: { scope: 'global' } })
    ])
    return {
      rule: asRule(own),
      effective: { ...DEFAULT_FINE_RULE, ...(asRule(globalRule) ?? {}), ...(asRule(categoryRule) ?? {}), ...(asRule(own) ?? {}) },
      pesos: {
        absent: formatPeso((asRule(own) ?? asRule(categoryRule) ?? asRule(globalRule) ?? DEFAULT_FINE_RULE).absentCentavos),
        late: formatPeso((asRule(own) ?? asRule(categoryRule) ?? asRule(globalRule) ?? DEFAULT_FINE_RULE).lateCentavos)
      }
    }
  }

  if (getMethod(event) === 'DELETE') {
    await prisma.fineRule.deleteMany({ where: { eventId } })
    await auditWrite(prisma, {
      actor: user,
      action: 'fine_rule_cleared',
      targetType: 'event',
      targetId: eventId,
      details: { scope: 'event' },
      ...auditContext(event)
    })
    return noContent(event, 204)
  }

  if (getMethod(event) === 'PUT') {
    const body = await readJsonBody(event) ?? {}
    const existing = await findRule()
    const rule = validateRule(body, asRule(existing) ?? DEFAULT_FINE_RULE)

    const saved = await prisma.fineRule.upsert({
      where: { eventId },
      create: { scope: 'event', eventId, ...rule },
      update: rule
    })

    await auditWrite(prisma, {
      actor: user,
      action: 'fine_rule_updated',
      targetType: 'event',
      targetId: eventId,
      details: { scope: 'event', ...rule },
      ...auditContext(event)
    })

    return { rule: asRule(saved), pesos: { absent: formatPeso(saved.absentCentavos), late: formatPeso(saved.lateCentavos) } }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
