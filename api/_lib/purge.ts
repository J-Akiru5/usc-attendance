import { prisma } from './prisma.js'
import { expiredSemesters } from './retention.js'

type Db = typeof prisma

export async function getSettings(db: Db) {
  return (await db.settings.findFirst()) ?? (await db.settings.create({ data: {} }))
}

/**
 * Delete the signature IMAGE (not the attendance row, hash or reference) for every
 * signature that belongs to a semester that has aged out under the retention setting.
 */
export async function runSignaturePurge(
  db: Db,
  performedBy: string | null,
  now: Date = new Date()
): Promise<{ purged: number; semesters: string[] }> {
  const settings = await getSettings(db)
  const semesters = await db.semester.findMany()
  const due = expiredSemesters(semesters, settings.signatureRetentionSemesters, settings.purgeGraceDays, now)

  let purged = 0
  for (const sem of due) {
    const r = await db.attendanceSignature.updateMany({
      where: { purgedAt: null, signedAt: { gte: sem.startsOn, lt: sem.endsOn } },
      data: { png: null, purgedAt: now },
    })
    purged += r.count
  }

  await db.settings.update({ where: { id: settings.id }, data: { lastPurgeAt: now, lastPurgeCount: purged } })
  await db.auditLog.create({
    data: {
      userId: null,
      action: 'signatures_purged',
      details: JSON.stringify({ purged, semesters: due.map((s) => s.name), keep: settings.signatureRetentionSemesters }),
      performedBy,
    },
  })
  return { purged, semesters: due.map((s) => s.name) }
}
