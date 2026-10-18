import { createHmac, timingSafeEqual } from 'crypto'
import { HttpError } from './http'

/**
 * 30 s, matching the benchmark the rebuild targets (CampusGroups-style
 * refreshing QR): scan-to-confirmation stays well inside the token lifetime and
 * the client refreshes before expiry (see app/pages/qr.vue).
 */
const TOKEN_TTL_SECONDS = 30

export interface QrTokenPayload {
  /** userId the token was issued for */
  u: string
  /** eventId */
  e: string
  /** issuedAt, unix seconds */
  i: number
  /** exp, unix seconds */
  x: number
}

function getSecret(): string {
  const secret = process.env.QR_SECRET
  if (!secret) {
    console.error('[qr] QR_SECRET is not set — refusing to sign or verify tokens')
    throw new HttpError(500, 'QR signing is not configured')
  }
  return secret
}

function sign(body: string): string {
  return createHmac('sha256', getSecret()).update(body).digest('base64url')
}

/** Issue a short-lived, server-signed QR token for a user's own account. */
export function issueQrToken(
  userId: string,
  eventId: string,
  now: number = Math.floor(Date.now() / 1000)
): { token: string, exp: number } {
  const payload: QrTokenPayload = { u: userId, e: eventId, i: now, x: now + TOKEN_TTL_SECONDS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { token: `${body}.${sign(body)}`, exp: payload.x }
}

/** Verify a scanned token and return its payload. Throws 400/403 on any failure. */
export function verifyQrToken(
  token: string,
  now: number = Math.floor(Date.now() / 1000)
): QrTokenPayload {
  const dot = token.lastIndexOf('.')
  if (dot <= 0 || dot === token.length - 1) {
    throw new HttpError(400, 'Malformed QR token')
  }
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = Buffer.from(sign(body))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new HttpError(403, 'Invalid QR code signature')
  }

  let payload: QrTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as QrTokenPayload
  } catch {
    throw new HttpError(400, 'Malformed QR token')
  }

  if (
    typeof payload?.u !== 'string'
    || typeof payload?.e !== 'string'
    || typeof payload?.i !== 'number'
    || typeof payload?.x !== 'number'
  ) {
    throw new HttpError(400, 'Malformed QR token')
  }

  if (now > payload.x) {
    throw new HttpError(403, 'QR code has expired')
  }

  return payload
}
