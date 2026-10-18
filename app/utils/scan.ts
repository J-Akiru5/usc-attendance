/**
 * Scanner helpers (plan §8.2). The officer's camera can land on two very
 * different things: a signed QR token from a student's phone, or the 1D
 * barcode off a student ID (the ISUFST ID carries the student number). These
 * helpers only decide what was scanned and who it points at — the recording
 * itself always goes through the server's own guards.
 */
export type ScannedKind = 'qr' | 'student-number' | 'unknown'

/** A signed QR token: three base64url segments, exactly what our QR carries. */
const JWT_LIKE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
/** A student number as printed on an ID: letters, digits and dashes. */
const NUMBER_LIKE = /^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/

export function classifyScan(text: string): ScannedKind {
  const value = String(text ?? '').trim()
  if (!value) return 'unknown'
  if (JWT_LIKE.test(value)) return 'qr'
  if (NUMBER_LIKE.test(value)) return 'student-number'
  return 'unknown'
}

/** Student numbers compare case- and spacing-insensitively. */
export function normaliseStudentNo(text: string): string {
  return String(text ?? '').replace(/\s+/g, '').toUpperCase()
}

/** The one student whose number matches exactly, if there is exactly one. */
export function findExactStudent<T extends { studentNo: string | null }>(students: T[], query: string): T | null {
  const wanted = normaliseStudentNo(query)
  if (!wanted) return null
  const matches = students.filter(s => normaliseStudentNo(s.studentNo ?? '') === wanted)
  return matches.length === 1 ? matches[0]! : null
}
