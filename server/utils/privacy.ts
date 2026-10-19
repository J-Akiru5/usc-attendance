import { badRequest } from './http'
import { parseYearLevel } from './academic'
import { normalizeName, normalizeStudentNo } from './students'

/**
 * Data-subject rights, self-served (plan §8.9 and §11.2, benchmark BC-11).
 *
 * Everything in this module is pure: the export builder takes the rows the
 * route already fetched and re-builds them field by field, so a column added to
 * the database later cannot leak into an export until someone deliberately
 * lists it here. The same property is what keeps another student's row out —
 * every row is checked against the subject id even though the queries are
 * already scoped.
 *
 * Two rights are represented:
 *   - access/portability: `buildPrivacyExport`
 *   - rectification: `parseRectificationRequest` + `parseDecision`
 *
 * Erasure is deliberately out of scope (the plan records why: council records
 * follow the university retention schedule).
 */

export const EXPORT_SCHEMA_VERSION = 1

/** Sections the export promises. Used in the audit row and the UI copy. */
export const EXPORT_SECTIONS = [
  'profile',
  'attendance',
  'fines',
  'clearances',
  'excuses',
  'privacyRequests'
] as const

/**
 * Data that is deliberately *not* exported, with the reason a reader needs.
 * This is documentation the UI and the tests can quote; it is not a filter.
 */
export const EXPORT_EXCLUSIONS = [
  'other students — every row is checked against the caller id',
  'internal notes — fine waive/served reasons, excuse review notes and clearance notes',
  'raw geolocation — the coordinates belong to door validation, not to the subject record',
  'staff identifiers — recorder, issuer, reviewer and decider ids stay out of the bundle',
  'attachment storage keys — the export lists records, not private object paths'
] as const

// ---------------------------------------------------------------------------
// Rectification rules
// ---------------------------------------------------------------------------

/**
 * Fields a student may ask to correct.
 *
 * `name`, `studentNo`, `yearLevel` and `section` are stored facts a student
 * cannot edit directly (plan §8.1). Derived values (a computed clearance
 * standing), financial history (fine amounts, payments, waivers) and anything
 * that records an event are not correctable here: those need the office's
 * records process, not a form that rewrites history.
 */
export const CORRECTABLE_FIELDS = ['name', 'studentNo', 'yearLevel', 'section'] as const

export type CorrectableField = typeof CORRECTABLE_FIELDS[number]

export const CORRECTABLE_FIELD_LABELS: Record<CorrectableField, string> = {
  name: 'Full name',
  studentNo: 'Student number',
  yearLevel: 'Year level',
  section: 'Section'
}

/** Hints shown next to the form. Plain text, no personal data. */
export const CORRECTABLE_FIELD_HINTS: Record<CorrectableField, string> = {
  name: 'As it appears on your university record.',
  studentNo: 'The number on your school ID, e.g. 22-0001.',
  yearLevel: 'A whole number from 1 to 6.',
  section: 'The exact section name from the council list, e.g. BSIT 1-A.'
}

export interface RectificationRequestInput {
  field: CorrectableField
  proposedValue: string
  note: string | null
}

const MAX_NOTE_LENGTH = 500

const FIELD_ALIASES: Record<string, CorrectableField> = {
  student_number: 'studentNo',
  student_id: 'studentNo',
  year_level: 'yearLevel',
  full_name: 'name'
}

export function correctableFieldOf(value: unknown): CorrectableField | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return CORRECTABLE_FIELDS.find(field => field.toLowerCase() === normalized)
    ?? FIELD_ALIASES[normalized]
    ?? null
}

export function isCorrectableField(value: unknown): value is CorrectableField {
  return correctableFieldOf(value) !== null
}

function optionalNote(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string') throw badRequest('The note must be text')
  const note = raw.trim()
  if (!note) return null
  if (note.length > MAX_NOTE_LENGTH) {
    throw badRequest(`Keep the note to ${MAX_NOTE_LENGTH} characters or fewer`)
  }
  return note
}

/**
 * Parse a rectification request body.
 *
 * Refusals are explicit: an empty value, a missing field and a non-correctable
 * field all throw 400 before anything is written. `proposedValue` is
 * normalised with the same helpers the student-administration route uses, so a
 * request cannot smuggle in a value that route would reject.
 */
export function parseRectificationRequest(body: unknown): RectificationRequestInput {
  const input = (body ?? {}) as Record<string, unknown>

  const rawField = typeof input.field === 'string' ? input.field.trim() : ''
  if (!rawField) throw badRequest('Choose the field you want corrected')
  const field = correctableFieldOf(rawField)
  if (!field) {
    throw badRequest(
      `That field cannot be corrected here. Correctable fields: ${CORRECTABLE_FIELDS.join(', ')}. `
      + 'Fines, payments, attendance records and clearance standing are changed only by the council office.'
    )
  }

  const rawValue = input.proposedValue ?? input.proposed ?? input.value
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    throw badRequest('Enter the corrected value')
  }

  let proposedValue: string
  switch (field) {
    case 'name':
      proposedValue = normalizeName(rawValue)
      break
    case 'studentNo':
      proposedValue = normalizeStudentNo(rawValue)
      break
    case 'yearLevel':
      proposedValue = String(parseYearLevel(rawValue))
      break
    case 'section': {
      const value = rawValue.replace(/\s+/g, ' ').trim()
      if (value.length < 2 || value.length > 80) throw badRequest('Enter the section name (2 to 80 characters)')
      if ([...value].some((char) => {
        const code = char.charCodeAt(0)
        return code < 32 || code === 127
      })) {
        throw badRequest('The section name contains invalid characters')
      }
      proposedValue = value
      break
    }
    default:
      throw badRequest('Unknown correctable field')
  }

  return { field, proposedValue, note: optionalNote(input.note) }
}

export const DECISION_STATUSES = ['accepted', 'rejected'] as const
export type DecisionStatus = typeof DECISION_STATUSES[number]

export interface RectificationDecision {
  status: DecisionStatus
  reason: string
}

const MAX_REASON_LENGTH = 1000

/**
 * Both outcomes need a reason. A rejection with no reason is not a decision a
 * data subject can act on, and an acceptance without one cannot say why the
 * record changed.
 */
export function parseDecision(body: unknown): RectificationDecision {
  const input = (body ?? {}) as Record<string, unknown>
  const status = typeof input.status === 'string' ? input.status.trim().toLowerCase() : ''
  if (status !== 'accepted' && status !== 'rejected') {
    throw badRequest('Decision must be accepted or rejected')
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) throw badRequest('A decision needs a reason')
  if (reason.length > MAX_REASON_LENGTH) {
    throw badRequest(`Keep the reason to ${MAX_REASON_LENGTH} characters or fewer`)
  }
  return { status, reason }
}

// ---------------------------------------------------------------------------
// Export shape
// ---------------------------------------------------------------------------

export interface ExportUser {
  id: string
  email: string
  name: string
  position: string
  role: string
  createdAt: Date | string
  consentAt: Date | string | null
  consentVersion: string | null
  consentSource: string | null
}

export interface ExportProfile {
  studentNo: string
  program: string | null
  yearLevel: number | null
  contactNumber: string | null
  college: { code: string, name: string } | null
  programRef: { code: string, name: string } | null
  section: { name: string, yearLevel: number } | null
}

export interface ExportAttendanceRow {
  id: string
  userId: string
  type: string
  method: string
  createdAt: Date | string
  checkOutAt: Date | string | null
  dutyDate: Date | string | null
  event: { title: string, date: Date | string } | null
  signature: { signedAt: Date | string, purgedAt: Date | string | null } | null
}

export interface ExportFineRow {
  id: string
  userId: string
  kind: string
  sanctionType: string
  amountCentavos: number
  status: string
  issuedAt: Date | string
  paidAt: Date | string | null
  paymentRef: string | null
  waivedAt: Date | string | null
  servedAt: Date | string | null
  event: { title: string, date: Date | string } | null
}

export interface ExportClearanceRow {
  id: string
  userId: string
  code: string
  coveredCentavos: number
  issuedAt: Date | string
  revokedAt: Date | string | null
}

export interface ExportExcuseRow {
  id: string
  userId: string
  category: string
  reason: string
  status: string
  createdAt: Date | string
  reviewedAt: Date | string | null
}

export interface ExportPrivacyRequestRow {
  id: string
  userId: string
  kind: string
  field: string
  proposedValue: string
  note: string | null
  status: string
  reason: string | null
  createdAt: Date | string
  decidedAt: Date | string | null
}

export interface PrivacyExportInput {
  user: ExportUser
  profile: ExportProfile | null
  attendance: ExportAttendanceRow[]
  fines: ExportFineRow[]
  clearances: ExportClearanceRow[]
  excuses: ExportExcuseRow[]
  privacyRequests: ExportPrivacyRequestRow[]
}

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : value
}

/**
 * Build the bundle a data subject receives.
 *
 * Every object is constructed explicitly (never spread from a database row), so
 * a new column does not become an export field by accident. Rows that do not
 * belong to the subject are dropped rather than trusted to the query.
 */
export function buildPrivacyExport(input: PrivacyExportInput, generatedAt: Date = new Date()) {
  const owner = input.user.id

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    notice: 'This file is a copy of the personal data the USC officer portal holds about you. '
      + 'It excludes other students, staff identifiers, internal notes, raw door-validation coordinates '
      + 'and private attachment storage keys. Keep it somewhere safe.',
    subject: {
      id: input.user.id,
      email: input.user.email,
      name: input.user.name,
      position: input.user.position,
      role: input.user.role,
      accountCreatedAt: iso(input.user.createdAt)
    },
    consents: {
      coreAttendance: {
        grantedAt: iso(input.user.consentAt),
        noticeVersion: input.user.consentVersion,
        source: input.user.consentSource
      }
    },
    profile: input.profile
      ? {
          studentNo: input.profile.studentNo,
          program: input.profile.program,
          yearLevel: input.profile.yearLevel,
          contactNumber: input.profile.contactNumber,
          college: input.profile.college ? { code: input.profile.college.code, name: input.profile.college.name } : null,
          programRef: input.profile.programRef ? { code: input.profile.programRef.code, name: input.profile.programRef.name } : null,
          section: input.profile.section ? { name: input.profile.section.name, yearLevel: input.profile.section.yearLevel } : null
        }
      : null,
    attendance: input.attendance
      .filter(row => row.userId === owner)
      .map(row => ({
        id: row.id,
        type: row.type,
        method: row.method,
        recordedAt: iso(row.createdAt),
        checkedOutAt: iso(row.checkOutAt),
        dutyDate: iso(row.dutyDate),
        event: row.event ? { title: row.event.title, date: iso(row.event.date) } : null,
        signature: row.signature
          ? { signedAt: iso(row.signature.signedAt), retained: row.signature.purgedAt === null }
          : null
      })),
    fines: input.fines
      .filter(row => row.userId === owner)
      .map(row => ({
        id: row.id,
        kind: row.kind,
        sanctionType: row.sanctionType,
        amountCentavos: row.amountCentavos,
        status: row.status,
        issuedAt: iso(row.issuedAt),
        paidAt: iso(row.paidAt),
        paymentRef: row.paymentRef,
        waivedAt: iso(row.waivedAt),
        servedAt: iso(row.servedAt),
        event: row.event ? { title: row.event.title, date: iso(row.event.date) } : null
      })),
    clearances: input.clearances
      .filter(row => row.userId === owner)
      .map(row => ({
        id: row.id,
        code: row.code,
        coveredCentavos: row.coveredCentavos,
        issuedAt: iso(row.issuedAt),
        revokedAt: iso(row.revokedAt)
      })),
    excuses: input.excuses
      .filter(row => row.userId === owner)
      .map(row => ({
        id: row.id,
        category: row.category,
        reason: row.reason,
        status: row.status,
        createdAt: iso(row.createdAt),
        reviewedAt: iso(row.reviewedAt)
      })),
    privacyRequests: input.privacyRequests
      .filter(row => row.userId === owner)
      .map(row => ({
        id: row.id,
        kind: row.kind,
        field: row.field,
        proposedValue: row.proposedValue,
        note: row.note,
        status: row.status,
        reason: row.reason,
        createdAt: iso(row.createdAt),
        decidedAt: iso(row.decidedAt)
      }))
  }
}

export type PrivacyExport = ReturnType<typeof buildPrivacyExport>
