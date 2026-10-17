import { beforeAll, describe, expect, it } from 'vitest'
import { HttpError } from './http.js'
import { issueQrToken, verifyQrToken } from './qr.js'

const SECRET = 'test-qr-secret-at-least-32-chars-long!!'

beforeAll(() => {
  process.env.QR_SECRET = SECRET
})

function expectHttpError(fn: () => unknown, status: number, messagePart?: string) {
  try {
    fn()
    expect.unreachable('expected HttpError to be thrown')
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(status)
    if (messagePart) expect((err as HttpError).message).toContain(messagePart)
  }
}

describe('issueQrToken / verifyQrToken', () => {
  it('round-trips a fresh token', () => {
    const { token, exp } = issueQrToken('user-1', 'event-1')
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    const payload = verifyQrToken(token)
    expect(payload.u).toBe('user-1')
    expect(payload.e).toBe('event-1')
  })

  it('rejects an expired token with 403', () => {
    const past = Math.floor(Date.now() / 1000) - 120
    const { token } = issueQrToken('user-1', 'event-1', past)
    expectHttpError(() => verifyQrToken(token), 403, 'expired')
  })

  it('rejects a token signed with a different secret with 403', () => {
    const { token } = issueQrToken('user-1', 'event-1')
    process.env.QR_SECRET = 'another-secret-not-the-right-one!!!!'
    try {
      expectHttpError(() => verifyQrToken(token), 403, 'signature')
    } finally {
      process.env.QR_SECRET = SECRET
    }
  })

  it('rejects a tampered payload with 403', () => {
    const { token } = issueQrToken('user-1', 'event-1')
    const [body, sig] = token.split('.')
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    decoded.u = 'user-victim'
    const forgedBody = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    expectHttpError(() => verifyQrToken(`${forgedBody}.${sig}`), 403, 'signature')
  })

  it('rejects garbage with 400', () => {
    expectHttpError(() => verifyQrToken('not-a-token'), 400, 'Malformed')
    // Has a dot but no valid signature — rejected at the signature check (403), never parsed
    expectHttpError(() => verifyQrToken('a.b.c'), 403, 'signature')
  })

  it('fails closed when QR_SECRET is unset', () => {
    const saved = process.env.QR_SECRET
    delete process.env.QR_SECRET
    try {
      expectHttpError(() => issueQrToken('user-1', 'event-1'), 500, 'not configured')
    } finally {
      process.env.QR_SECRET = saved
    }
  })
})
