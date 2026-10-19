import type { PrismaClient } from '@prisma/client'
import type { ExistingExpectedRow, SnapshotPlan } from './expected'

/**
 * Database side of the expected-roster snapshot (benchmark BC-4). The rules live
 * in `expected.ts`; this file only reads the rows back and writes a plan.
 */

/** Existing snapshot rows per event, for a set of events (one query). */
export async function existingSnapshots(
  db: PrismaClient,
  eventIds: string[]
): Promise<Map<string, ExistingExpectedRow[]>> {
  const map = new Map<string, ExistingExpectedRow[]>()
  if (eventIds.length === 0) return map

  const rows = await db.eventExpected.findMany({
    where: { eventId: { in: eventIds } },
    select: {
      eventId: true,
      userId: true,
      source: true,
      collegeId: true,
      yearLevel: true,
      sectionId: true,
      snapshotAt: true
    }
  })

  for (const row of rows) {
    const list = map.get(row.eventId) ?? []
    list.push({
      userId: row.userId,
      source: row.source,
      collegeId: row.collegeId,
      yearLevel: row.yearLevel,
      sectionId: row.sectionId,
      snapshotAt: row.snapshotAt
    })
    map.set(row.eventId, list)
  }
  return map
}

export interface SnapshotState {
  frozen: boolean
  frozenAt: Date | null
  count: number
  source: string | null
}

/** What is frozen for one event, without loading every row. */
export async function snapshotStatus(db: PrismaClient, eventId: string): Promise<SnapshotState> {
  const [count, first] = await Promise.all([
    db.eventExpected.count({ where: { eventId } }),
    db.eventExpected.findFirst({
      where: { eventId },
      orderBy: { snapshotAt: 'desc' },
      select: { snapshotAt: true, source: true }
    })
  ])

  return {
    frozen: count > 0,
    frozenAt: first?.snapshotAt ?? null,
    count,
    source: first?.source ?? null
  }
}

/**
 * Apply a plan. An unchanged plan writes nothing at all — that is what keeps a
 * second freeze idempotent. A changed plan replaces the event's rows in one
 * transaction, so readers never see a half-written roster; the `snapshotAt` on
 * every row is the new freeze time.
 */
export async function writeSnapshot(db: PrismaClient, plan: SnapshotPlan): Promise<boolean> {
  if (plan.unchanged) return false

  await db.$transaction(async (tx) => {
    await tx.eventExpected.deleteMany({ where: { eventId: plan.eventId } })
    if (plan.rows.length > 0) {
      await tx.eventExpected.createMany({ data: plan.rows })
    }
  })
  return true
}
