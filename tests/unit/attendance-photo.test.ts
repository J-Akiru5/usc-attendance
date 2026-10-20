import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_PHOTO_PREFIX,
  DEFAULT_ATTENDANCE_PHOTO_RETENTION_DAYS,
  MAX_ATTENDANCE_PHOTO_BYTES,
  attendancePhotoBackend,
  attendancePhotoContentType,
  attendancePhotoExpiresAt,
  attendancePhotoMethodProblem,
  attendancePhotoObjectKey,
  attendancePhotoRefBindingProblem,
  attendancePhotoRetentionDays,
  attendancePhotoSizeProblem,
  attendancePhotoStoreProblem,
  attendancePhotoTypeProblem,
  detectAttendancePhotoMime,
  readAttendancePhotoRef,
  runAttendancePhotoPurge,
  signAttendancePhotoRef,
  type AttendancePhotoStore
} from '../../server/utils/attendance-photo'

const env = (values: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  values as NodeJS.ProcessEnv

const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00])
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37])

describe('attendance photo size and type guards', () => {
  it('accepts a normal photo and refuses empty or oversized bytes', () => {
    expect(attendancePhotoSizeProblem(0)).toMatch(/empty/i)
    expect(attendancePhotoSizeProblem(1)).toBeNull()
    expect(attendancePhotoSizeProblem(MAX_ATTENDANCE_PHOTO_BYTES)).toBeNull()
    expect(attendancePhotoSizeProblem(MAX_ATTENDANCE_PHOTO_BYTES + 1)).toMatch(/larger than 1\.5 MB/i)
    expect(MAX_ATTENDANCE_PHOTO_BYTES).toBe(1_572_864)
  })

  it('detects JPEG, PNG and WebP from magic bytes only', () => {
    expect(detectAttendancePhotoMime(JPEG)).toBe('image/jpeg')
    expect(detectAttendancePhotoMime(PNG)).toBe('image/png')
    expect(detectAttendancePhotoMime(WEBP)).toBe('image/webp')
    expect(detectAttendancePhotoMime(PDF)).toBeNull()
    expect(detectAttendancePhotoMime(new TextEncoder().encode('<svg></svg>'))).toBeNull()
  })

  it('refuses a declared type that does not match the bytes', () => {
    expect(attendancePhotoTypeProblem('image/jpeg', JPEG)).toEqual({ mime: 'image/jpeg' })
    expect(attendancePhotoTypeProblem('image/png', PNG)).toEqual({ mime: 'image/png' })
    expect(attendancePhotoTypeProblem('image/jpg', JPEG)).toEqual({ mime: 'image/jpeg' })
    expect(attendancePhotoTypeProblem('image/png', JPEG)).toEqual({
      problem: expect.stringMatching(/not the image type it claims/i)
    })
    expect(attendancePhotoTypeProblem('image/svg+xml', PDF)).toEqual({
      problem: expect.stringMatching(/JPEG, PNG or WebP/i)
    })
    // A phone may omit File.type; the bytes still decide.
    expect(attendancePhotoTypeProblem('', PNG)).toEqual({ mime: 'image/png' })
  })

  it('builds a key under the private prefix and maps it back to a content type', () => {
    const jpegKey = attendancePhotoObjectKey('scan-key-12345678', 'image/jpeg')
    expect(jpegKey).toBe(`${ATTENDANCE_PHOTO_PREFIX}scan-key-12345678.jpg`)
    expect(attendancePhotoContentType(jpegKey)).toBe('image/jpeg')
    expect(attendancePhotoContentType(attendancePhotoObjectKey('scan-key-12345678', 'image/png'))).toBe('image/png')
    expect(attendancePhotoContentType(attendancePhotoObjectKey('scan-key-12345678', 'image/webp'))).toBe('image/webp')
  })
})

describe('attendance photo retention', () => {
  it('defaults to 90 days and reads one env value', () => {
    expect(DEFAULT_ATTENDANCE_PHOTO_RETENTION_DAYS).toBe(90)
    expect(attendancePhotoRetentionDays(env({}))).toBe(90)
    expect(attendancePhotoRetentionDays(env({ ATTENDANCE_PHOTO_RETENTION_DAYS: '30' }))).toBe(30)
    expect(attendancePhotoRetentionDays(env({ ATTENDANCE_PHOTO_RETENTION_DAYS: '1' }))).toBe(1)
    expect(attendancePhotoRetentionDays(env({ ATTENDANCE_PHOTO_RETENTION_DAYS: '3650' }))).toBe(3650)
  })

  it('falls back to 90 for an invalid or dangerous value instead of shortening retention', () => {
    for (const value of ['0', '-5', '1.5', 'abc', '3651', ' ']) {
      expect(attendancePhotoRetentionDays(env({ ATTENDANCE_PHOTO_RETENTION_DAYS: value }))).toBe(90)
    }
  })

  it('computes the expiry from the capture moment', () => {
    const captured = new Date('2026-10-20T10:00:00.000Z')
    const thirty = attendancePhotoExpiresAt(captured, env({ ATTENDANCE_PHOTO_RETENTION_DAYS: '30' }))
    expect(thirty.toISOString()).toBe('2026-11-19T10:00:00.000Z')
    const ninety = attendancePhotoExpiresAt(captured, env({}))
    expect(ninety.toISOString()).toBe('2027-01-18T10:00:00.000Z')
  })
})

describe('which check-ins may carry a photo', () => {
  it('allows a manual event entry, with or without the optional photo', () => {
    expect(attendancePhotoMethodProblem({ method: 'manual', type: 'event', hasRef: true })).toBeNull()
    expect(attendancePhotoMethodProblem({ method: 'manual', type: 'event', hasRef: false })).toBeNull()
  })

  it('refuses a photo on QR, self and barcode check-ins', () => {
    for (const method of ['qr', 'self', 'barcode']) {
      expect(attendancePhotoMethodProblem({ method, type: 'event', hasRef: true })).toMatch(/manual check-in/i)
    }
  })

  it('refuses a photo on a duty entry but keeps a duty entry without one valid', () => {
    expect(attendancePhotoMethodProblem({ method: 'manual', type: 'duty', hasRef: true })).toMatch(/event check-in/i)
    expect(attendancePhotoMethodProblem({ method: 'manual', type: 'duty', hasRef: false })).toBeNull()
  })

  it('does not complain when a non-manual entry simply has no photo', () => {
    expect(attendancePhotoMethodProblem({ method: 'qr', type: 'event', hasRef: false })).toBeNull()
  })
})

describe('signed photo reference', () => {
  const secret = 'unit-test-secret'
  const capturedAt = new Date('2026-10-20T10:00:00.000Z')
  const now = new Date('2026-10-20T10:05:00.000Z')
  const env90 = env({ ATTENDANCE_PHOTO_RETENTION_DAYS: '90' })

  const sign = () => signAttendancePhotoRef({
    key: 'attendance-photos/scan-key-12345678.jpg',
    userId: 'student-1',
    eventId: 'event-1',
    capturedAt,
    mime: 'image/jpeg'
  }, secret)

  it('round-trips the key, target and capture moment', () => {
    const parsed = readAttendancePhotoRef(sign(), secret, now, env90)
    expect(parsed).not.toBeNull()
    expect(parsed?.key).toBe('attendance-photos/scan-key-12345678.jpg')
    expect(parsed?.userId).toBe('student-1')
    expect(parsed?.eventId).toBe('event-1')
    expect(parsed?.capturedAt.toISOString()).toBe(capturedAt.toISOString())
    expect(parsed?.expiresAt.toISOString()).toBe('2027-01-18T10:00:00.000Z')
  })

  it('refuses a tampered signature, the wrong secret or no secret', () => {
    const ref = sign()
    const tampered = `${ref.slice(0, -1)}${ref.endsWith('A') ? 'B' : 'A'}`
    expect(readAttendancePhotoRef(tampered, secret, now, env90)).toBeNull()
    expect(readAttendancePhotoRef(ref, 'another-secret', now, env90)).toBeNull()
    expect(readAttendancePhotoRef(ref, null, now, env90)).toBeNull()
    expect(readAttendancePhotoRef(`${ref}.extra`, secret, now, env90)).toBeNull()
    expect(readAttendancePhotoRef('', secret, now, env90)).toBeNull()
  })

  it('refuses a capture older than the queue window or too far in the future', () => {
    const ref = sign()
    expect(readAttendancePhotoRef(ref, secret, new Date('2026-10-22T11:00:00.000Z'), env90)).toBeNull()
    expect(readAttendancePhotoRef(ref, secret, new Date('2026-10-20T09:50:00.000Z'), env90)).toBeNull()
  })

  it('refuses a reference whose retention has already run out', () => {
    const ref = sign()
    const env30 = env({ ATTENDANCE_PHOTO_RETENTION_DAYS: '30' })
    expect(readAttendancePhotoRef(ref, secret, now, env30)).not.toBeNull()
    expect(readAttendancePhotoRef(ref, secret, new Date('2026-11-20T10:00:00.000Z'), env30)).toBeNull()
  })

  it('refuses a key outside the private prefix or a disallowed type', () => {
    const outsidePrefix = signAttendancePhotoRef({
      key: 'photos/scan-key-12345678.jpg',
      userId: 'student-1',
      eventId: 'event-1',
      capturedAt,
      mime: 'image/jpeg'
    }, secret)
    expect(readAttendancePhotoRef(outsidePrefix, secret, now, env90)).toBeNull()

    const ref = sign()
    const [version, body, signature] = ref.split('.') as [string, string, string]
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
    payload.m = 'application/pdf'
    const forgedBody = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const forged = `${version}.${forgedBody}.${signature}`
    expect(readAttendancePhotoRef(forged, secret, now, env90)).toBeNull()
  })

  it('binds the reference to the same student and event', () => {
    const parsed = readAttendancePhotoRef(sign(), secret, now, env90)
    expect(parsed).not.toBeNull()
    if (!parsed) return
    expect(attendancePhotoRefBindingProblem(parsed, { userId: 'student-1', eventId: 'event-1' })).toBeNull()
    expect(attendancePhotoRefBindingProblem(parsed, { userId: 'student-2', eventId: 'event-1' })).toMatch(/different check-in/i)
    expect(attendancePhotoRefBindingProblem(parsed, { userId: 'student-1', eventId: 'event-2' })).toMatch(/different check-in/i)
    expect(attendancePhotoRefBindingProblem(parsed, { userId: 'student-1', eventId: null })).toMatch(/different check-in/i)
  })
})

describe('private storage choices', () => {
  it('uses the filesystem outside production and refuses an unconfigured production', () => {
    expect(attendancePhotoBackend(env({ NODE_ENV: 'development' }))).toBe('filesystem')
    expect(attendancePhotoBackend(env({ NODE_ENV: 'test' }))).toBe('filesystem')
    expect(attendancePhotoBackend(env({ NODE_ENV: 'production' }))).toBeNull()
    expect(attendancePhotoBackend(env({ NODE_ENV: 'production', ATTENDANCE_PHOTO_STORAGE: 'filesystem' }))).toBe('filesystem')
    expect(attendancePhotoBackend(env({ NODE_ENV: 'production', ATTENDANCE_PHOTO_BUCKET: 'private-bucket' }))).toBe('r2')
    expect(attendancePhotoStoreProblem(env({ NODE_ENV: 'production' }))).toMatch(/not configured/i)
  })

  it('refuses an unknown backend rather than guessing', () => {
    expect(attendancePhotoBackend(env({ ATTENDANCE_PHOTO_STORAGE: 'supabase' }))).toBeNull()
    expect(attendancePhotoStoreProblem(env({ ATTENDANCE_PHOTO_STORAGE: 'supabase' }))).toMatch(/unknown/i)
  })
})

type PurgeDb = Parameters<typeof runAttendancePhotoPurge>[0]

function fakePurgeDb(rows: Array<{ id: string, photoKey: string | null }>) {
  const calls = { updateMany: 0 }
  const db = {
    attendance: {
      findMany: async () => rows,
      updateMany: async () => {
        calls.updateMany += 1
        return { count: rows.length }
      }
    }
  } as unknown as PurgeDb
  return { db, calls }
}

describe('photo purge', () => {
  it('deletes the objects before clearing the row and leaves the attendance instance alone', async () => {
    const deleted: string[] = []
    const store: AttendancePhotoStore = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async (keys) => { deleted.push(...keys) }
    }
    const { db, calls } = fakePurgeDb([
      { id: 'attendance-1', photoKey: 'attendance-photos/one.jpg' },
      { id: 'attendance-2', photoKey: 'attendance-photos/two.png' }
    ])
    const result = await runAttendancePhotoPurge(db, store, new Date('2026-10-21T00:00:00Z'))
    expect(deleted).toEqual(['attendance-photos/one.jpg', 'attendance-photos/two.png'])
    expect(result).toEqual({ purged: 2, skipped: 0 })
    expect(calls.updateMany).toBe(1)
  })

  it('keeps the row pointing at the photo when storage is unavailable', async () => {
    const { db, calls } = fakePurgeDb([{ id: 'attendance-1', photoKey: 'attendance-photos/one.jpg' }])
    const result = await runAttendancePhotoPurge(db, null, new Date('2026-10-21T00:00:00Z'))
    expect(result).toEqual({ purged: 0, skipped: 1 })
    expect(calls.updateMany).toBe(0)
  })

  it('does nothing when no photo is due', async () => {
    const deleted: string[] = []
    const store: AttendancePhotoStore = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async (keys) => { deleted.push(...keys) }
    }
    const { db, calls } = fakePurgeDb([])
    expect(await runAttendancePhotoPurge(db, store)).toEqual({ purged: 0, skipped: 0 })
    expect(deleted).toEqual([])
    expect(calls.updateMany).toBe(0)
  })
})
