import { badRequest, HttpError } from './http'

/**
 * Academic reference data (plan §8.1): colleges → programs → sections.
 *
 * The pure helpers here are unit-tested; the DB-facing ones take an injected
 * store so tests can run without a database (same pattern as the students
 * module's rate limiter).
 */

export const DEFAULT_YEAR_LEVELS = 4
export const MAX_YEAR_LEVELS = 6

/** College/program codes: 2–12 chars, A–Z 0–9 and dashes. */
export function normalizeAcademicCode(raw: unknown, label: string): string {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!/^[A-Z0-9-]{2,12}$/.test(value)) {
    throw badRequest(`${label} must be 2 to 12 characters (letters, digits, dashes)`)
  }
  return value
}

export function normalizeAcademicName(raw: unknown, label: string, max = 80): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value.length < 3 || value.length > max) {
    throw badRequest(`${label} must be ${3} to ${max} characters`)
  }
  return value
}

/** How many year levels a program has (default 4, editable — e.g. a 5-year course). */
export function parseYearLevels(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_YEAR_LEVELS
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > MAX_YEAR_LEVELS) {
    throw badRequest(`Year levels must be a whole number between 1 and ${MAX_YEAR_LEVELS}`)
  }
  return value
}

/** A student's year level, bounded by the program's length. */
export function parseYearLevel(raw: unknown, max: number = MAX_YEAR_LEVELS): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw badRequest(`Year level must be a whole number between 1 and ${max}`)
  }
  return value
}

export function normalizeContactNumber(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return null
  if (!/^[0-9+()\s-]{7,20}$/.test(value)) {
    throw badRequest('Contact number must be 7 to 20 digits, spaces, dashes, parentheses or +')
  }
  return value
}

export interface PlacementInput {
  collegeId: string | null
  programId: string | null
  yearLevel: number | null
  sectionId: string | null
}

/** Reads the (optional) academic placement out of a request body. */
export function parsePlacement(body: Record<string, unknown>): PlacementInput {
  const asString = (raw: unknown) => (typeof raw === 'string' && raw.trim() ? raw.trim() : null)
  const year = body.yearLevel
  return {
    collegeId: asString(body.collegeId),
    programId: asString(body.programId),
    yearLevel: year === undefined || year === null || year === '' ? null : parseYearLevel(year),
    sectionId: asString(body.sectionId)
  }
}

/** True when the body carried no placement at all (the field is optional). */
export function isPlacementEmpty(input: PlacementInput): boolean {
  return !input.collegeId && !input.programId && !input.yearLevel && !input.sectionId
}

export interface AcademicStore {
  college: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string, archived: boolean } | null>
  }
  program: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string, collegeId: string, name: string, yearLevels: number, archived: boolean } | null>
  }
  section: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string, programId: string, yearLevel: number, archived: boolean } | null>
  }
}

export interface ResolvedPlacement {
  collegeId: string
  programId: string
  yearLevel: number
  sectionId: string | null
  programName: string
}

/**
 * Validates an academic placement against the reference data: the program must
 * belong to the college, the year level must exist on the program, and the
 * section (optional) must belong to that program + year. Returns null when the
 * placement was empty.
 */
export async function resolvePlacement(
  db: AcademicStore,
  input: PlacementInput
): Promise<ResolvedPlacement | null> {
  if (isPlacementEmpty(input)) return null

  if (!input.collegeId) throw badRequest('College is required')
  if (!input.programId) throw badRequest('Program is required')
  if (input.yearLevel === null) throw badRequest('Year level is required')

  const college = await db.college.findUnique({ where: { id: input.collegeId } })
  if (!college) throw new HttpError(400, 'Unknown college')
  if (college.archived) throw badRequest('That college is archived')

  const program = await db.program.findUnique({ where: { id: input.programId } })
  if (!program) throw new HttpError(400, 'Unknown program')
  if (program.archived) throw badRequest('That program is archived')
  if (program.collegeId !== college.id) throw badRequest('That program does not belong to the selected college')

  const yearLevel = parseYearLevel(input.yearLevel, program.yearLevels)

  let sectionId: string | null = null
  if (input.sectionId) {
    const section = await db.section.findUnique({ where: { id: input.sectionId } })
    if (!section) throw new HttpError(400, 'Unknown section')
    if (section.archived) throw badRequest('That section is archived')
    if (section.programId !== program.id) throw badRequest('That section does not belong to the selected program')
    if (section.yearLevel !== yearLevel) throw badRequest('That section is not offered in the selected year level')
    sectionId = section.id
  }

  return { collegeId: college.id, programId: program.id, yearLevel, sectionId, programName: program.name }
}
