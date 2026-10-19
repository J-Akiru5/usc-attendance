import type { PrismaClient } from '@prisma/client'
import type { AttendanceLike, AudienceLike } from './analytics'
import { activeStudentPlacements } from './audience'

/**
 * The rows the analytics routes share (plan §8.3). Kept apart from
 * `analytics.ts` (pure maths) so the routes stay thin and every number is
 * computed by tested functions.
 */
export interface SemesterWindow {
  id: string | null
  name: string | null
  startsOn: Date | null
  endsOn: Date | null
}

/** The semester asked for, or the one covering now; null window = all time. */
export async function resolveSemester(db: PrismaClient, requested?: string): Promise<SemesterWindow> {
  if (requested) {
    const row = await db.semester.findUnique({ where: { id: requested } })
    if (!row) return { id: null, name: null, startsOn: null, endsOn: null }
    return { id: row.id, name: row.name, startsOn: row.startsOn, endsOn: row.endsOn }
  }

  const now = new Date()
  const current = await db.semester.findFirst({
    where: { startsOn: { lte: now }, endsOn: { gt: now } },
    orderBy: { startsOn: 'desc' }
  })
  if (!current) return { id: null, name: null, startsOn: null, endsOn: null }
  return { id: current.id, name: current.name, startsOn: current.startsOn, endsOn: current.endsOn }
}

export interface EventWindowRow {
  id: string
  title: string
  date: Date
  registrationRequired: boolean
  audienceType: string
  audienceCollegeId: string | null
  audienceYearLevel: number | null
  audienceSectionId: string | null
  category: { id: string, name: string, color: string | null } | null
}

export async function eventsInWindow(db: PrismaClient, window: SemesterWindow): Promise<EventWindowRow[]> {
  return db.event.findMany({
    where: window.startsOn && window.endsOn ? { date: { gte: window.startsOn, lt: window.endsOn } } : {},
    orderBy: { date: 'desc' },
    select: {
      id: true,
      title: true,
      date: true,
      registrationRequired: true,
      audienceType: true,
      audienceCollegeId: true,
      audienceYearLevel: true,
      audienceSectionId: true,
      category: { select: { id: true, name: true, color: true } }
    }
  })
}

/** Attendance of the given events, with just enough to test for a signature. */
export async function attendanceRows(db: PrismaClient, eventIds: string[]): Promise<Array<AttendanceLike & { eventId: string | null }>> {
  if (eventIds.length === 0) return []
  const rows = await db.attendance.findMany({
    where: { eventId: { in: eventIds } },
    select: { userId: true, method: true, createdAt: true, eventId: true, signature: { select: { signedAt: true } } }
  })
  return rows.map(row => ({
    userId: row.userId,
    method: row.method,
    createdAt: row.createdAt,
    eventId: row.eventId,
    hasSignature: row.signature !== null
  }))
}

/** Registrants per event, for the events that take registrations. */
export async function registrationsByEvent(db: PrismaClient, eventIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (eventIds.length === 0) return map
  const rows = await db.eventRegistration.findMany({
    where: { eventId: { in: eventIds }, status: 'registered' },
    select: { eventId: true, userId: true }
  })
  for (const row of rows) {
    const list = map.get(row.eventId) ?? []
    list.push(row.userId)
    map.set(row.eventId, list)
  }
  return map
}

/** Active students with their placement — the live audience (see `audience.ts`). */
export async function activeAudience(db: PrismaClient): Promise<AudienceLike[]> {
  return activeStudentPlacements(db)
}
