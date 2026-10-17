import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, readJsonBody, respond } from '../../utils/http'
import { parseRetention, requireSettingsManager } from '../../utils/retention'
import { getSettings } from '../../utils/purge'

// ---------------------------------------------------------------------------
// GET/PUT /api/settings/retention   — settings managers only
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  const actor = await authenticate(event)
  requireSettingsManager(actor)

  if (getMethod(event) === 'GET') {
    const [settings, semesters] = await Promise.all([
      getSettings(prisma),
      prisma.semester.findMany({ orderBy: { startsOn: 'asc' } })
    ])
    const live = await prisma.attendanceSignature.count({ where: { purgedAt: null } })
    const inSemester
      = semesters.length === 0
        ? 0
        : await prisma.attendanceSignature.count({
            where: { purgedAt: null, OR: semesters.map(s => ({ signedAt: { gte: s.startsOn, lt: s.endsOn } })) }
          })
    return {
      signatureRetentionSemesters: settings.signatureRetentionSemesters,
      purgeGraceDays: settings.purgeGraceDays,
      lastPurgeAt: settings.lastPurgeAt,
      lastPurgeCount: settings.lastPurgeCount,
      semesters,
      liveSignatures: live,
      unassignedSignatures: live - inSemester
    }
  }

  if (getMethod(event) === 'PUT') {
    const input = parseRetention(await readJsonBody(event))
    const settings = await getSettings(prisma)
    const updated = await prisma.settings.update({ where: { id: settings.id }, data: input })
    await prisma.auditLog.create({
      data: { userId: null, action: 'retention_changed', details: JSON.stringify(input), performedBy: actor.id }
    })
    return {
      signatureRetentionSemesters: updated.signatureRetentionSemesters,
      purgeGraceDays: updated.purgeGraceDays
    }
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
