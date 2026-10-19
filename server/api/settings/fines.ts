import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, readJsonBody, respond } from '../../utils/http'
import { requireSettingsManager } from '../../utils/retention'
import { DEFAULT_FINE_RULE, formatPeso, resolveRule, validateRule, type FineRule } from '../../utils/fines'
import { auditContext, auditWrite } from '../../utils/audit'

/**
 * GET/PUT /api/settings/fines — the fine rates (plan §8.5). The global rule is
 * what most events use; a category can carry its own, and any single event can
 * override both. The resolved precedence lives in `server/utils/fines.ts`.
 */
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

export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET' && getMethod(event) !== 'PUT') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const actor = await authenticate(event)
  requireSettingsManager(actor)

  if (getMethod(event) === 'GET') {
    const [globalRow, categoryRules] = await Promise.all([
      prisma.fineRule.findFirst({ where: { scope: 'global' } }),
      prisma.fineRule.findMany({
        where: { scope: 'category' },
        include: { category: { select: { id: true, code: true, name: true } } }
      })
    ])

    const global = asRule(globalRow) ?? DEFAULT_FINE_RULE
    return {
      global: { ...global, pesos: { absent: formatPeso(global.absentCentavos), late: formatPeso(global.lateCentavos) } },
      categories: categoryRules.map(row => ({
        category: row.category,
        rule: asRule(row),
        pesos: { absent: formatPeso(row.absentCentavos), late: formatPeso(row.lateCentavos) }
      }))
    }
  }

  const body = await readJsonBody(event) ?? {}
  const categoryId = typeof body.categoryId === 'string' && body.categoryId.length > 0 ? body.categoryId : null

  if (categoryId) {
    const category = await prisma.eventCategory.findUnique({ where: { id: categoryId }, select: { id: true } })
    if (!category) return respond(event, 404, { error: 'Event category not found' })

    const existing = await prisma.fineRule.findUnique({ where: { categoryId } })
    const rule = validateRule(body, asRule(existing) ?? (await prisma.fineRule.findFirst({ where: { scope: 'global' } }).then(asRule)) ?? DEFAULT_FINE_RULE)

    const saved = await prisma.fineRule.upsert({
      where: { categoryId },
      create: { scope: 'category', categoryId, ...rule },
      update: rule
    })

    await auditWrite(prisma, {
      actor: actor,
      action: 'fine_rule_updated',
      targetType: 'fine_rule',
      targetId: saved.id,
      details: { scope: 'category', categoryId, ...rule },
      ...auditContext(event)
    })
    return { rule: asRule(saved), pesos: { absent: formatPeso(saved.absentCentavos), late: formatPeso(saved.lateCentavos) } }
  }

  const existing = await prisma.fineRule.findFirst({ where: { scope: 'global' } })
  const rule = validateRule(body, asRule(existing) ?? DEFAULT_FINE_RULE)

  const saved = existing
    ? await prisma.fineRule.update({ where: { id: existing.id }, data: rule })
    : await prisma.fineRule.create({ data: { scope: 'global', ...rule } })

  await auditWrite(prisma, {
    actor: actor,
    action: 'fine_rule_updated',
    targetType: 'fine_rule',
    targetId: saved.id,
    details: { scope: 'global', ...rule },
    ...auditContext(event)
  })

  // What an event with no overrides would actually use, for the caller's sanity.
  return {
    rule: asRule(saved),
    pesos: { absent: formatPeso(saved.absentCentavos), late: formatPeso(saved.lateCentavos) },
    resolved: resolveRule(asRule(saved), null, null)
  }
})
