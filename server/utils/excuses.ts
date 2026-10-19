import { badRequest } from './http'

/**
 * Excuse requests (plan §8.5): a student files one against a fine, staff approve
 * (which waives the fine) or deny it. The rules are pure so the state machine is
 * tested without a database.
 */
export const EXCUSE_CATEGORIES = ['medical', 'academic', 'other'] as const
export type ExcuseCategory = typeof EXCUSE_CATEGORIES[number]

export const EXCUSE_ATTACHMENT_MIMES = ['image/png', 'image/jpeg', 'application/pdf'] as const
export const EXCUSE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

/** Why a fine cannot be excused right now, or null when it can. */
export function excuseBlockedReason(fine: { status: string }, existing: Array<{ status: string }>): string | null {
  if (fine.status === 'paid') return 'That fine is already settled'
  if (fine.status === 'waived') return 'That fine is already waived'
  if (existing.some(row => row.status === 'pending')) return 'An excuse for that fine is already waiting for review'
  return null
}

export interface ExcuseInput {
  category: ExcuseCategory
  reason: string
}

/** Validates the text half of a request. */
export function validateExcuse(body: Record<string, unknown>): ExcuseInput {
  const category = String(body.category ?? 'other')
  if (!(EXCUSE_CATEGORIES as readonly string[]).includes(category)) {
    throw badRequest(`category must be one of ${EXCUSE_CATEGORIES.join(', ')}`)
  }

  const reason = String(body.reason ?? '').trim()
  if (reason.length < 10 || reason.length > 2000) {
    throw badRequest('A reason is needed (10–2000 characters)')
  }

  return { category: category as ExcuseCategory, reason }
}

/** Validates the file half, when one was sent. */
export function validateAttachment(mime: unknown, size: unknown): { mime: string, size: number } | null {
  if (mime === undefined && size === undefined) return null
  if (typeof mime !== 'string' || !(EXCUSE_ATTACHMENT_MIMES as readonly string[]).includes(mime)) {
    throw badRequest(`Attachments must be one of ${EXCUSE_ATTACHMENT_MIMES.join(', ')}`)
  }
  const bytes = Number(size)
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > EXCUSE_ATTACHMENT_MAX_BYTES) {
    throw badRequest('Attachments must be between 1 byte and 5 MB')
  }
  return { mime, size: bytes }
}

/** What approving does to the fine (the reviewer's name is kept for the record). */
export function waiverFor(fine: { id: string, status: string }, reviewerId: string, note: string | null, now: Date = new Date()): {
  status: 'waived'
  waivedAt: Date
  waivedBy: string
  waiveReason: string
} {
  if (fine.status === 'paid') throw badRequest('That fine is already settled and cannot be waived')
  return {
    status: 'waived',
    waivedAt: now,
    waivedBy: reviewerId,
    waiveReason: note?.trim().length ? note.trim().slice(0, 500) : 'Excuse approved'
  }
}
