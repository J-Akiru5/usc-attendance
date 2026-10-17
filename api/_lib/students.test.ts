import { describe, expect, it } from 'vitest'
import { Jimp } from 'jimp'
import { HttpError } from './http.js'
import {
  clientIp,
  normalizeName,
  normalizeStudentEmail,
  normalizeStudentNo,
  overLimit,
  parseRegistration,
  validatePassword
} from './students.js'
import {
  decodeSignatureDataUrl,
  hasInk,
  inspectPng,
  sha256Hex,
  signatureRef,
  validateSignature
} from './signature.js'

function http(fn: () => unknown, status = 400, part?: string) {
  try {
    fn()
    expect.unreachable('expected HttpError')
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError)
    expect((e as HttpError).status).toBe(status)
    if (part) expect((e as HttpError).message).toContain(part)
  }
}

const good = {
  email: 'Juan.Dela.Cruz@isufst.edu.ph ',
  name: '  Juan   Dela Cruz ',
  studentNo: '22-0123',
  program: 'BSIT',
  consent: true
}

describe('registration validation', () => {
  it('accepts and normalises a good request', () => {
    expect(parseRegistration(good)).toEqual({
      email: 'juan.dela.cruz@isufst.edu.ph',
      name: 'Juan Dela Cruz',
      studentNo: '22-0123',
      program: 'BSIT'
    })
  })
  it('requires privacy consent', () => {
    http(() => parseRegistration({ ...good, consent: false }), 400, 'Privacy')
    http(() => parseRegistration({ ...good, consent: 'true' }), 400, 'Privacy')
  })
  it('only allows exactly @isufst.edu.ph', () => {
    http(() => normalizeStudentEmail('a@gmail.com'), 400, 'school email')
    http(() => normalizeStudentEmail('a@evil.isufst.edu.ph'), 400, 'school email')
    http(() => normalizeStudentEmail('a@isufst.edu.ph.evil.com'), 400, 'school email')
    http(() => normalizeStudentEmail('not-an-email'), 400)
    http(() => normalizeStudentEmail(undefined), 400)
    expect(normalizeStudentEmail('A@ISUFST.EDU.PH')).toBe('a@isufst.edu.ph')
  })
  it('student numbers: 4-20 alphanumerics/dashes, uppercased', () => {
    expect(normalizeStudentNo('ab-12345')).toBe('AB-12345')
    http(() => normalizeStudentNo('abc'))
    http(() => normalizeStudentNo('has space'))
    http(() => normalizeStudentNo('x\'; drop table--'))
  })
  it('names: letters and common punctuation only', () => {
    expect(normalizeName('Rena Grace B. Aquiño')).toBe('Rena Grace B. Aquiño')
    expect(normalizeName('Ma. O\'Neil-Cruz, Jr.')).toBe('Ma. O\'Neil-Cruz, Jr.')
    http(() => normalizeName('='))
    http(() => normalizeName('<script>'))
    http(() => normalizeName('A'))
  })
  it('passwords: length and not containing the email name', () => {
    http(() => validatePassword('short', 'juan@isufst.edu.ph'), 400, '8 to 72')
    http(() => validatePassword('x'.repeat(73), 'juan@isufst.edu.ph'), 400, '8 to 72')
    http(() => validatePassword('my-juandc-pass', 'juandc@isufst.edu.ph'), 400, 'email name')
    expect(validatePassword('correct horse battery', 'juan@isufst.edu.ph')).toBe('correct horse battery')
  })
})

describe('rate limiting helpers', () => {
  it('clientIp reads the first forwarded address', () => {
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })).toBe('1.2.3.4')
    expect(clientIp({})).toBe('unknown')
  })
  it('overLimit compares the count with the max', async () => {
    const db = (n: number) => ({ auditLog: { count: async () => n } })
    expect(await overLimit(db(4), 'a', 'k', 5, 1000)).toBe(false)
    expect(await overLimit(db(5), 'a', 'k', 5, 1000)).toBe(true)
  })
})

async function pngDataUrl(draw: boolean, w = 400, h = 150): Promise<string> {
  const img = new Jimp({ width: w, height: h, color: 0x00000000 })
  if (draw) {
    for (let x = 20; x < 300; x++) for (let t = 0; t < 4; t++) img.setPixelColor(0x000000ff, x, 60 + t + (x % 20))
  }
  const buf = await img.getBuffer('image/png')
  return 'data:image/png;base64,' + buf.toString('base64')
}

describe('signature validation', () => {
  it('accepts a drawn signature and hashes it', async () => {
    const { png, sha256 } = await validateSignature(await pngDataUrl(true))
    expect(png.length).toBeGreaterThan(100)
    expect(sha256).toHaveLength(64)
    expect(signatureRef(sha256)).toMatch(/^SIG-[0-9A-F]{10}$/)
    expect(sha256Hex(png)).toBe(sha256)
  })
  it('rejects a blank canvas', async () => {
    await expect(validateSignature(await pngDataUrl(false))).rejects.toMatchObject({ status: 400 })
    expect(await hasInk(Buffer.from((await pngDataUrl(false)).split(',')[1], 'base64'))).toBe(false)
  })
  it('rejects non-PNG, bad base64, oversize, and wrong dimensions', async () => {
    http(() => decodeSignatureDataUrl('data:image/jpeg;base64,AAAA'))
    http(() => decodeSignatureDataUrl('not a url'))
    http(() => decodeSignatureDataUrl('data:image/png;base64,@@@@'))
    http(() => decodeSignatureDataUrl('data:image/png;base64,' + 'A'.repeat(300_000)), 400, 'too large')
    http(() => inspectPng(Buffer.from('definitely not a png file at all, just text')), 400, 'valid PNG')
    const tiny = Buffer.from((await pngDataUrl(true, 30, 10)).split(',')[1], 'base64')
    http(() => inspectPng(tiny), 400, 'dimensions')
  })
})
