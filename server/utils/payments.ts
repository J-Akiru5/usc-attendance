import { badRequest } from './http'
import { formatPeso, totalCentavos } from './fines'

/**
 * Payments, clearance and verification (plan §8.5). One payment settles one fine
 * in full — partial payments are deliberately out of scope for v1, so the rule
 * is "exactly the amount owed, with a real reference" and nothing cleverer.
 *
 * A clearance is a *certificate*, not a state: it records what was owed when it
 * was issued and carries a random code. Whether the student is still clear is
 * recomputed at verification time, which is what makes an old or forged
 * certificate useless.
 */
export type PaymentMethod = 'cash' | 'gcash'
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'gcash']

/** Why a fine cannot be settled right now, or null when it can. */
export function paymentBlockedReason(fine: { status: string }): string | null {
  if (fine.status === 'paid') return 'That fine is already settled'
  if (fine.status === 'waived') return 'That fine was waived — there is nothing to settle'
  return null
}

export interface PaymentInput {
  method: PaymentMethod
  reference: string
  amountCentavos: number
  note: string | null
}

export function validatePayment(
  body: Record<string, unknown>,
  fine: { amountCentavos: number, status: string }
): PaymentInput {
  const method = String(body.method ?? '')
  if (!(PAYMENT_METHODS as string[]).includes(method)) {
    throw badRequest(`method must be one of ${PAYMENT_METHODS.join(', ')}`)
  }

  const reference = String(body.reference ?? '').trim()
  if (reference.length < 3 || reference.length > 40) {
    throw badRequest('A reference is needed — the OR number for cash, or the GCash reference')
  }

  const amount = Number(body.amountCentavos ?? fine.amountCentavos)
  if (!Number.isInteger(amount) || amount !== fine.amountCentavos) {
    throw badRequest(`Payments settle the full amount (${formatPeso(fine.amountCentavos)})`)
  }

  return {
    method: method as PaymentMethod,
    reference,
    amountCentavos: amount,
    note: typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null
  }
}

/** Codes avoid I, O, 0 and 1 so a person can read one aloud without mistakes. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function clearanceCode(random: () => number = Math.random, length = 10): string {
  let code = ''
  for (let index = 0; index < length; index++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return code
}

/** What a person typed, reduced to what the code actually is. */
export function normaliseCode(input: string): string {
  return String(input ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface ClearanceState {
  cleared: boolean
  unpaidCentavos: number
  unpaidPesos: string
}

/** Cleared means nothing unpaid — settled and waived fines do not block. */
export function clearanceState(fines: Array<{ amountCentavos: number, status: string }>): ClearanceState {
  const unpaid = totalCentavos(fines)
  return { cleared: unpaid === 0, unpaidCentavos: unpaid, unpaidPesos: formatPeso(unpaid) }
}

export type VerificationStatus = 'valid' | 'no-longer-cleared' | 'revoked' | 'unknown'

export interface PublicVerification {
  status: VerificationStatus
  /**
   * D-07: a public page confirms *standing*, never *who*. Name, student number
   * and amount are deliberately absent — anyone with a code learns whether a
   * certificate stands, when it was issued and who issued it, and nothing else.
   */
  issuedAt?: string
  issuer?: string
  checkedAt: string
}

/**
 * What the PUBLIC /verify page may say. `currentlyCleared` is recomputed from
 * the live fines at verification time — an old certificate for someone who now
 * owes money reads "no longer cleared" rather than lying.
 *
 * A last-4-digits challenge was considered and dropped: with no personal data in
 * the response there is nothing for it to protect, and asking for it would imply
 * the page is more dangerous than it is.
 */
export function publicVerification(input: {
  clearance: { code: string, issuedAt: Date, coveredCentavos: number, revokedAt: Date | null } | null
  issuer?: { name: string } | null
  currentlyCleared: boolean
  now?: Date
}): PublicVerification {
  const checkedAt = (input.now ?? new Date()).toISOString()

  if (!input.clearance) return { status: 'unknown', checkedAt }
  if (input.clearance.revokedAt) return { status: 'revoked', checkedAt }

  return {
    status: input.currentlyCleared ? 'valid' : 'no-longer-cleared',
    issuedAt: input.clearance.issuedAt.toISOString(),
    ...(input.issuer ? { issuer: input.issuer.name } : {}),
    checkedAt
  }
}
