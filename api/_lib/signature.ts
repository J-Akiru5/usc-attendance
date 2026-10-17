import { createHash } from 'crypto'
import { Jimp } from 'jimp'
import { badRequest } from './http.js'

export const MAX_SIGNATURE_BYTES = 200 * 1024
/** How long after check-in the attendee may still sign. */
export const SIGN_WINDOW_MS = 24 * 60 * 60 * 1000

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PREFIX = 'data:image/png;base64,'

/** Strictly decode a PNG data URL. */
export function decodeSignatureDataUrl(input: unknown): Buffer {
  if (typeof input !== 'string' || !input.startsWith(PREFIX)) {
    throw badRequest('signature must be a PNG data URL')
  }
  const b64 = input.slice(PREFIX.length)
  if (b64.length === 0 || b64.length > Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw badRequest('Signature image is invalid or too large')
  }
  const buf = Buffer.from(b64, 'base64')
  if (buf.length > MAX_SIGNATURE_BYTES) throw badRequest('Signature image is too large')
  return buf
}

/** Verify PNG magic + IHDR and reasonable dimensions. */
export function inspectPng(buf: Buffer): { width: number, height: number } {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_MAGIC) || buf.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw badRequest('Signature is not a valid PNG')
  }
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  if (width < 100 || height < 40 || width > 1600 || height > 1000) {
    throw badRequest('Signature image has unsupported dimensions')
  }
  return { width, height }
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Short human-checkable reference printed in exports. */
export function signatureRef(sha256: string): string {
  return 'SIG-' + sha256.slice(0, 10).toUpperCase()
}

/** True if the PNG contains a meaningful amount of drawn (non-transparent) ink. */
export async function hasInk(buf: Buffer, minPixels = 40): Promise<boolean> {
  const img = await Jimp.read(buf)
  const data = img.bitmap.data
  let ink = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 40 && ++ink >= minPixels) return true
  }
  return false
}

/** Full validation pipeline used by the sign endpoint. */
export async function validateSignature(dataUrl: unknown): Promise<{ png: Buffer, sha256: string }> {
  const png = decodeSignatureDataUrl(dataUrl)
  inspectPng(png)
  if (!(await hasInk(png))) throw badRequest('Please draw your signature before submitting')
  return { png, sha256: sha256Hex(png) }
}
