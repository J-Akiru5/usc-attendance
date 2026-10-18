import type { PrismaClient } from '@prisma/client'
import { MAX_OCCURRENCES, expandRecurrence, formatRrule, parseRrule, planSeriesChanges } from './recurrence'
import { badRequest } from './http'

/**
 * Recurring events (plan §8.2). A series is the master event (the first
 * instance, carrying the RRULE) plus one real event row per later occurrence —
 * so attendance, registration and the QR flow all stay per occurrence.
 */

/** Fields every instance of a series shares with its master. */
export interface SeriesTemplate {
  title: string
  lat: number
  lng: number
  radiusMeters: number
  categoryId: string | null
  capacity: number | null
  registrationRequired: boolean
  createdBy: string
}

/** Parses + expands a rule, refusing anything that would create an ocean of events. */
export function planOccurrences(rule: string, start: Date): { dates: Date[], rrule: string } {
  let spec
  try {
    spec = parseRrule(rule)
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid recurrence rule')
  }

  const { occurrences, truncated } = expandRecurrence(spec, start)
  if (truncated) {
    throw badRequest(`That rule creates more than ${MAX_OCCURRENCES} occurrences — give it an end date or fewer repeats`)
  }

  return { dates: occurrences, rrule: formatRrule(spec) }
}

/** One row per later occurrence, after the master exists. */
export async function createOccurrences(
  db: PrismaClient,
  masterId: string,
  dates: Date[],
  template: SeriesTemplate
): Promise<number> {
  const later = dates.slice(1)
  if (later.length === 0) return 0

  const { count } = await db.event.createMany({
    data: later.map((date, index) => ({
      ...template,
      date,
      seriesId: masterId,
      recurrenceIndex: index + 1
    }))
  })
  return count
}

export interface SeriesSync {
  /** Instances added for newly wanted dates. */
  created: number
  /** Instances the rule no longer wants and that held no data. */
  removed: number
  /** Instances left exactly where they were. */
  kept: number
  /** Instances the rule no longer wants but that hold attendance or registrations. */
  locked: number
}

/**
 * Moves an existing series to `dates` without ever deleting an instance that has
 * attendance or registrations attached — those are kept (and counted) so history
 * survives a schedule change.
 */
export async function syncOccurrences(
  db: PrismaClient,
  masterId: string,
  dates: Date[],
  template: SeriesTemplate
): Promise<SeriesSync> {
  const existing = await db.event.findMany({
    where: { seriesId: masterId },
    select: {
      id: true,
      date: true,
      _count: { select: { attendance: true, registrations: true } }
    }
  })

  const plan = planSeriesChanges(
    dates.slice(1),
    existing.map(row => ({
      id: row.id,
      date: row.date,
      locked: row._count.attendance > 0 || row._count.registrations > 0
    }))
  )

  if (plan.remove.length > 0) await db.event.deleteMany({ where: { id: { in: plan.remove } } })

  // Instances share the master's details, so a rename or venue change follows.
  const shared = {
    title: template.title,
    lat: template.lat,
    lng: template.lng,
    radiusMeters: template.radiusMeters,
    categoryId: template.categoryId,
    capacity: template.capacity,
    registrationRequired: template.registrationRequired
  }

  let created = 0
  if (plan.create.length > 0) {
    const { count } = await db.event.createMany({
      data: plan.create.map(date => ({
        ...shared,
        createdBy: template.createdBy,
        date,
        seriesId: masterId,
        recurrenceIndex: dates.findIndex(d => d.getTime() === date.getTime())
      }))
    })
    created = count
    await db.event.updateMany({ where: { seriesId: masterId }, data: shared })
  } else if (plan.keep.length > 0) {
    await db.event.updateMany({ where: { id: { in: plan.keep } }, data: shared })
  }

  return { created, removed: plan.remove.length, kept: plan.keep.length, locked: plan.locked.length }
}
