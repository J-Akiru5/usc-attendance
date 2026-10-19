import type { PrismaClient } from '@prisma/client'
import { badRequest, notFound } from './http'
import type { AudienceLike } from './analytics'

/**
 * The required audience (plan §8.2): who MUST attend an event. It is the
 * "expected" denominator in analytics and, in P4, the set that absence fines are
 * generated for — so it is defined once, here, and both read it.
 */
export const AUDIENCE_TYPES = ['all', 'college', 'yearLevel', 'section'] as const
export type AudienceType = typeof AUDIENCE_TYPES[number]

export interface AudienceSpec {
  type: AudienceType
  collegeId: string | null
  yearLevel: number | null
  sectionId: string | null
}

export const ALL_STUDENTS: AudienceSpec = { type: 'all', collegeId: null, yearLevel: null, sectionId: null }

/** Reads an event row into a spec, tolerating anything unexpected as "all". */
export function specFromEvent(event: {
  audienceType?: string | null
  audienceCollegeId?: string | null
  audienceYearLevel?: number | null
  audienceSectionId?: string | null
}): AudienceSpec {
  const type = (AUDIENCE_TYPES as readonly string[]).includes(event.audienceType ?? '')
    ? (event.audienceType as AudienceType)
    : 'all'

  if (type === 'college') return { type, collegeId: event.audienceCollegeId ?? null, yearLevel: null, sectionId: null }
  if (type === 'yearLevel') return { type, collegeId: null, yearLevel: event.audienceYearLevel ?? null, sectionId: null }
  if (type === 'section') return { type, collegeId: null, yearLevel: null, sectionId: event.audienceSectionId ?? null }
  return { ...ALL_STUDENTS }
}

/** Does this person belong to the required audience? (the rule, in one place) */
export function matchesAudience(member: AudienceLike, spec: AudienceSpec): boolean {
  if (spec.type === 'college') return spec.collegeId !== null && member.collegeId === spec.collegeId
  if (spec.type === 'yearLevel') return spec.yearLevel !== null && member.yearLevel === spec.yearLevel
  if (spec.type === 'section') return spec.sectionId !== null && member.sectionId === spec.sectionId
  return true
}

/** A sentence for the event page and the reports. */
export function describeAudience(spec: AudienceSpec, labels: { college?: string | null, section?: string | null } = {}): string {
  if (spec.type === 'college') return `Everyone in ${labels.college ?? 'the selected college'}`
  if (spec.type === 'yearLevel') return `Everyone in year ${spec.yearLevel ?? '?'}`
  if (spec.type === 'section') return `Everyone in ${labels.section ?? 'the selected section'}`
  return 'All students'
}

/**
 * Validates and normalises the audience fields of an event payload. Narrowing
 * always requires its target, and switching type clears the others so a stale
 * section can never linger on a college event.
 */
export async function parseAudience(
  db: PrismaClient,
  body: Record<string, unknown>,
  current: AudienceSpec = ALL_STUDENTS
): Promise<AudienceSpec> {
  const rawType = body.audienceType === undefined ? current.type : String(body.audienceType)
  if (!(AUDIENCE_TYPES as readonly string[]).includes(rawType)) {
    throw badRequest(`audienceType must be one of ${AUDIENCE_TYPES.join(', ')}`)
  }
  const type = rawType as AudienceType

  if (type === 'all') return { ...ALL_STUDENTS }

  if (type === 'college') {
    const collegeId = body.audienceCollegeId === undefined ? current.collegeId : (body.audienceCollegeId === null || body.audienceCollegeId === '' ? null : String(body.audienceCollegeId))
    if (!collegeId) throw badRequest('A college audience needs audienceCollegeId')
    const college = await db.college.findUnique({ where: { id: collegeId }, select: { id: true } })
    if (!college) throw notFound('College not found')
    return { type, collegeId, yearLevel: null, sectionId: null }
  }

  if (type === 'yearLevel') {
    const raw = body.audienceYearLevel === undefined ? current.yearLevel : body.audienceYearLevel
    const yearLevel = raw === null || raw === '' || raw === undefined ? null : Number(raw)
    if (yearLevel === null || !Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) {
      throw badRequest('A year-level audience needs audienceYearLevel between 1 and 6')
    }
    return { type, collegeId: null, yearLevel, sectionId: null }
  }

  const sectionId = body.audienceSectionId === undefined ? current.sectionId : (body.audienceSectionId === null || body.audienceSectionId === '' ? null : String(body.audienceSectionId))
  if (!sectionId) throw badRequest('A section audience needs audienceSectionId')
  const section = await db.section.findUnique({ where: { id: sectionId }, select: { id: true } })
  if (!section) throw notFound('Section not found')
  return { type, collegeId: null, yearLevel: null, sectionId }
}

/** The prisma columns for a spec (one shape everywhere). */
export function audienceColumns(spec: AudienceSpec): {
  audienceType: AudienceType
  audienceCollegeId: string | null
  audienceYearLevel: number | null
  audienceSectionId: string | null
} {
  return {
    audienceType: spec.type,
    audienceCollegeId: spec.collegeId,
    audienceYearLevel: spec.yearLevel,
    audienceSectionId: spec.sectionId
  }
}

/** A student and the placement that decides whether they match an audience. */
export interface StudentPlacement {
  userId: string
  collegeId: string | null
  yearLevel: number | null
  sectionId: string | null
}

/**
 * Every active student with their placement, in one query. The audience
 * resolvers and the roster snapshot both read this, so there is exactly one
 * definition of "the student body".
 */
export async function activeStudentPlacements(db: PrismaClient): Promise<StudentPlacement[]> {
  const students = await db.user.findMany({
    where: { active: true, role: 'student' },
    select: { id: true, studentProfile: { select: { collegeId: true, yearLevel: true, sectionId: true } } }
  })

  return students.map(row => ({
    userId: row.id,
    collegeId: row.studentProfile?.collegeId ?? null,
    yearLevel: row.studentProfile?.yearLevel ?? null,
    sectionId: row.studentProfile?.sectionId ?? null
  }))
}

/** The students required to attend an event, resolved from live data. */
export async function resolveAudience(db: PrismaClient, spec: AudienceSpec): Promise<string[]> {
  const members = await activeStudentPlacements(db)
  return members.filter(member => matchesAudience(member, spec)).map(member => member.userId)
}

/**
 * Resolves several events' audiences at once, asking the database once per
 * distinct spec (a semester of events usually shares a handful).
 */
export async function resolveAudiences(
  db: PrismaClient,
  specs: Array<{ key: string, spec: AudienceSpec }>
): Promise<Map<string, string[]>> {
  const bySignature = new Map<string, { spec: AudienceSpec, keys: string[] }>()
  for (const { key, spec } of specs) {
    const signature = `${spec.type}:${spec.collegeId ?? ''}:${spec.yearLevel ?? ''}:${spec.sectionId ?? ''}`
    const entry = bySignature.get(signature) ?? { spec, keys: [] }
    entry.keys.push(key)
    bySignature.set(signature, entry)
  }

  const resolved = new Map<string, string[]>()
  for (const { spec, keys } of bySignature.values()) {
    const ids = await resolveAudience(db, spec)
    for (const key of keys) resolved.set(key, ids)
  }
  return resolved
}
