const SECRET = import.meta.env.VITE_QR_SECRET || 'usc-attendance-qr-secret-change-in-prod'

export interface QRTokenPayload {
  userId: string
  eventId: string
  issuedAt: number
  exp: number
  sig: string
}

async function hmacSign(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function signString(userId: string, eventId: string, issuedAt: number): string {
  return `${userId}:${eventId}:${issuedAt}`
}

export async function generateQRToken(userId: string, eventId: string): Promise<QRTokenPayload> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const exp = issuedAt + 60
  const sig = await hmacSign(signString(userId, eventId, issuedAt))

  return { userId, eventId, issuedAt, exp, sig }
}

export async function verifyQRToken(token: QRTokenPayload): Promise<{ valid: boolean; error?: string }> {
  const now = Math.floor(Date.now() / 1000)

  if (now > token.exp) {
    return { valid: false, error: 'QR code has expired' }
  }

  const expectedSig = await hmacSign(signString(token.userId, token.eventId, token.issuedAt))

  if (expectedSig !== token.sig) {
    return { valid: false, error: 'Invalid QR code signature' }
  }

  return { valid: true }
}
