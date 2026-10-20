import type { prisma } from './prisma'
import { expiredSemesters } from './retention'
import { signatureStore, type SignatureObjectStore } from './signature-storage'
import { attendancePhotoStore, runAttendancePhotoPurge, type AttendancePhotoStore } from './attendance-photo'

type Db = typeof prisma

export async function getSettings(db: Db) {
  return (await db.settings.findFirst()) ?? (await db.settings.create({ data: {} }))
}

/**
 * Delete the signature IMAGE (not the attendance row, hash or reference) for every
 * signature that belongs to a semester that has aged out under the retention setting.
 * Images that live in object storage are deleted there first (plan §11.1).
 *
 * T-0009 extends the same daily job to ID photos: an expired photo is deleted
 * from private storage first, then its three columns are cleared. The
 * attendance row, reason and audit history stay untouched. Photos are purged
 * before signatures so identity evidence is not held back by a signature
 * storage outage.
 */
export async function runSignaturePurge(
  db: Db,
  performedBy: string | null,
  now: Date = new Date(),
  store: SignatureObjectStore | null = signatureStore(),
  photos: AttendancePhotoStore | null = attendancePhotoStore()
): Promise<{
  purged: number
  semesters: string[]
  photosPurged: number
  photosSkipped: number
}> {
  const photoPurge = await runAttendancePhotoPurge(db, photos, now)
  if (photoPurge.purged > 0 || photoPurge.skipped > 0) {
    await db.auditLog.create({
      data: {
        userId: null,
        action: 'attendance_photos_purged',
        details: JSON.stringify({ purged: photoPurge.purged, skipped: photoPurge.skipped }),
        performedBy
      }
    })
  }

  const settings = await getSettings(db)
  const semesters = await db.semester.findMany()
  const due = expiredSemesters(semesters, settings.signatureRetentionSemesters, settings.purgeGraceDays, now)

  let purged = 0
  for (const sem of due) {
    const where = { purgedAt: null, signedAt: { gte: sem.startsOn, lt: sem.endsOn } }

    // Objects first: if storage is unreachable the rows stay unpurged and the
    // next run retries, so the database never points at nothing.
    if (store) {
      const keys = await db.attendanceSignature.findMany({ where, select: { storageKey: true } })
      const objectKeys = keys.map(k => k.storageKey).filter((k): k is string => !!k)
      if (objectKeys.length > 0) await store.delete(objectKeys)
    }

    const r = await db.attendanceSignature.updateMany({
      where,
      data: { png: null, storageKey: null, purgedAt: now }
    })
    purged += r.count
  }

  await db.settings.update({ where: { id: settings.id }, data: { lastPurgeAt: now, lastPurgeCount: purged } })
  await db.auditLog.create({
    data: {
      userId: null,
      action: 'signatures_purged',
      details: JSON.stringify({
        purged,
        semesters: due.map(s => s.name),
        keep: settings.signatureRetentionSemesters,
        photosPurged: photoPurge.purged,
        photosSkipped: photoPurge.skipped
      }),
      performedBy
    }
  })
  return {
    purged,
    semesters: due.map(s => s.name),
    photosPurged: photoPurge.purged,
    photosSkipped: photoPurge.skipped
  }
}
