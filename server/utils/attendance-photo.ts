import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { prisma } from './prisma'
import { r2Client, r2Config } from './r2'
import { FUTURE_GRACE_MS, MAX_SYNC_AGE_MS } from './offline'

/**
 * Photo evidence for the manual check-in (T-0009, plan §8.2a).
 *
 * A manual entry is the one attendance path that bypasses the scanner, so the
 * owner decided it carries a reason and a photo of the student ID. A photo is a
 * new category of personal data, and this module is deliberately conservative:
 *
 *   - the bytes live in a PRIVATE object store, never in Postgres and never in
 *     the public event-photo bucket; the row holds only an opaque key;
 *   - the client never receives a public URL, and the read route streams (or
 *     redirects to a 60-second signed URL) only after an audited staff check;
 *   - only `method = "manual"` on an event may carry a photo;
 *   - the retention window is one env value, default 90 days;
 *   - the daily purge deletes the object FIRST, then clears the row, so a
 *     storage failure never leaves the database pointing at nothing.
 *
 * Everything that decides whether a photo may be attached is a pure function so
 * `tests/unit/attendance-photo.test.ts` can prove it without a database.
 */

/* ----------------------------------------------------------------------- size */

/** About 1.5 MB. A phone JPEG compressed for the screen fits comfortably. */
export const MAX_ATTENDANCE_PHOTO_BYTES = 1_572_864

/** The one JPEG/PNG/WebP check the upload route uses before touching storage. */
export function attendancePhotoSizeProblem(bytes: number, max = MAX_ATTENDANCE_PHOTO_BYTES): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'That photo is empty — take the picture again.'
  if (bytes > max) return 'That photo is larger than 1.5 MB — take a lower-resolution photo.'
  return null
}

/* ----------------------------------------------------------------------- type */

export const ATTENDANCE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AttendancePhotoMime = (typeof ATTENDANCE_PHOTO_MIME_TYPES)[number]

export const ATTENDANCE_PHOTO_PREFIX = 'attendance-photos/'

const EXTENSIONS: Record<AttendancePhotoMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

/** `image/jpg` is not a real MIME type but some phones send it; normalise, then match exactly. */
export function normalizeAttendancePhotoMime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const base = value.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'image/jpg') return 'image/jpeg'
  return base || null
}

/** The type the bytes actually are, decided from magic bytes — never from the file name. */
export function detectAttendancePhotoMime(bytes: Uint8Array): AttendancePhotoMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
    && bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
  ) return 'image/png'
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  return null
}

/**
 * Why the uploaded bytes cannot be stored, or `null` when they can. The declared
 * type must be one of the three allowed types AND match the bytes, so a PDF,
 * an SVG or a mislabelled text file never becomes "a photo".
 */
export function attendancePhotoTypeProblem(
  declared: unknown,
  bytes: Uint8Array
): { problem: string } | { mime: AttendancePhotoMime } {
  const detected = detectAttendancePhotoMime(bytes)
  if (!detected) return { problem: 'Attach a JPEG, PNG or WebP image of the student ID.' }
  const declaredMime = normalizeAttendancePhotoMime(declared)
  if (declaredMime && declaredMime !== detected) {
    return { problem: 'That file is not the image type it claims to be — take the photo again.' }
  }
  return { mime: detected }
}

/** The content type to send back for a stored key. Keys are server-made, so the extension is trusted. */
export function attendancePhotoContentType(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase() ?? ''
  return CONTENT_TYPES[extension] ?? 'application/octet-stream'
}

/**
 * `attendance-photos/<idempotency key>.<ext>`. Deriving the key from the scan's
 * stable key means a retried upload overwrites its own object instead of
 * dropping a second copy of the same identity document.
 */
export function attendancePhotoObjectKey(idempotencyKey: string, mime: AttendancePhotoMime): string {
  return `${ATTENDANCE_PHOTO_PREFIX}${idempotencyKey}.${EXTENSIONS[mime]}`
}

export function isAttendancePhotoKey(value: unknown): value is string {
  return typeof value === 'string' && /^attendance-photos\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(value)
}

/* ----------------------------------------------------------------- retention */

export const DEFAULT_ATTENDANCE_PHOTO_RETENTION_DAYS = 90
export const MAX_ATTENDANCE_PHOTO_RETENTION_DAYS = 3650
const DAY_MS = 86_400_000

/**
 * The single place the window is configured. An absent, non-numeric or
 * out-of-range value falls back to 90 days rather than shortening retention by
 * accident; the purge only ever deletes earlier than that if someone explicitly
 * sets a smaller valid number.
 */
export function attendancePhotoRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.ATTENDANCE_PHOTO_RETENTION_DAYS
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_ATTENDANCE_PHOTO_RETENTION_DAYS
  }
  const days = Number(raw)
  if (!Number.isInteger(days) || days < 1 || days > MAX_ATTENDANCE_PHOTO_RETENTION_DAYS) {
    return DEFAULT_ATTENDANCE_PHOTO_RETENTION_DAYS
  }
  return days
}

export function attendancePhotoExpiresAt(capturedAt: Date, env: NodeJS.ProcessEnv = process.env): Date {
  return new Date(capturedAt.getTime() + attendancePhotoRetentionDays(env) * DAY_MS)
}

/* ------------------------------------------------------------- signed reference */

/**
 * The upload route writes the object, then gives the client this short-lived
 * reference. The attendance route accepts only a valid reference for the same
 * student and event, so a client cannot attach somebody else's photo or point a
 * row at an arbitrary key. The reference is not a URL and grants no storage
 * access; it is an HMAC over the opaque key and its target.
 */
export interface AttendancePhotoRef {
  key: string
  userId: string
  eventId: string
  capturedAt: Date
  expiresAt: Date
  mime: AttendancePhotoMime
}

interface SignedPhotoRefPayload {
  k: string
  u: string
  e: string
  c: string
  m: AttendancePhotoMime
}

const REF_VERSION = 'v1'
const MAX_REF_LENGTH = 2048

/** The dedicated secret when set, otherwise the QR secret the deployment already has. */
export function attendancePhotoSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const dedicated = env.ATTENDANCE_PHOTO_SECRET?.trim()
  if (dedicated) return dedicated
  const shared = env.QR_SECRET?.trim()
  return shared || null
}

function signRefBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function signAttendancePhotoRef(
  input: { key: string, userId: string, eventId: string, capturedAt: Date, mime: AttendancePhotoMime },
  secret: string
): string {
  const payload: SignedPhotoRefPayload = {
    k: input.key,
    u: input.userId,
    e: input.eventId,
    c: input.capturedAt.toISOString(),
    m: input.mime
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${REF_VERSION}.${body}.${signRefBody(`${REF_VERSION}.${body}`, secret)}`
}

function isAttendancePhotoMime(value: unknown): value is AttendancePhotoMime {
  return typeof value === 'string' && (ATTENDANCE_PHOTO_MIME_TYPES as readonly string[]).includes(value)
}

/**
 * The reference as it should be trusted, or `null` for anything malformed,
 * tampered with, expired, or outside the queue's 48-hour window. A caller that
 * gets a reference back still has to check that its student and event match the
 * attendance request (`attendancePhotoRefBindingProblem`).
 */
export function readAttendancePhotoRef(
  ref: unknown,
  secret: string | null,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env
): AttendancePhotoRef | null {
  if (typeof ref !== 'string' || !secret) return null
  const text = ref.trim()
  if (text.length === 0 || text.length > MAX_REF_LENGTH) return null

  const parts = text.split('.')
  if (parts.length !== 3) return null
  const [version, body, signature] = parts as [string, string, string]
  if (version !== REF_VERSION || body.length === 0 || signature.length === 0) return null

  const expected = signRefBody(`${version}.${body}`, secret)
  const givenBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expected)
  if (givenBytes.length !== expectedBytes.length || !timingSafeEqual(givenBytes, expectedBytes)) return null

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload as Record<string, unknown>
  if (
    typeof candidate.k !== 'string'
    || typeof candidate.u !== 'string'
    || typeof candidate.e !== 'string'
    || typeof candidate.c !== 'string'
    || !isAttendancePhotoMime(candidate.m)
    || !isAttendancePhotoKey(candidate.k)
    || candidate.u.length === 0
    || candidate.e.length === 0
  ) return null

  const capturedAt = new Date(candidate.c)
  if (Number.isNaN(capturedAt.getTime())) return null
  if (capturedAt.getTime() > now.getTime() + FUTURE_GRACE_MS) return null
  if (now.getTime() - capturedAt.getTime() > MAX_SYNC_AGE_MS + FUTURE_GRACE_MS) return null

  const expiresAt = attendancePhotoExpiresAt(capturedAt, env)
  if (expiresAt.getTime() <= now.getTime()) return null

  return {
    key: candidate.k,
    userId: candidate.u,
    eventId: candidate.e,
    capturedAt,
    expiresAt,
    mime: candidate.m
  }
}

/** Photos belong to the manual event check-in only — never QR, self or barcode. */
export function attendancePhotoMethodProblem(input: {
  method: string
  type: string
  hasRef: boolean
}): string | null {
  if (!input.hasRef) return null
  if (input.method !== 'manual') {
    return 'ID photo evidence can only be attached to a manual check-in.'
  }
  if (input.type !== 'event') {
    return 'ID photo evidence can only be attached to an event check-in.'
  }
  return null
}

/** A signed reference for one student at one event cannot be attached to another. */
export function attendancePhotoRefBindingProblem(
  photo: AttendancePhotoRef,
  target: { userId: string, eventId: string | null }
): string | null {
  if (photo.userId !== target.userId || photo.eventId !== (target.eventId ?? '')) {
    return 'That ID photo reference belongs to a different check-in.'
  }
  return null
}

/* --------------------------------------------------------------------- storage */

/**
 * A private object store. `signedGetUrl` exists only for backends that can
 * issue a short-lived URL to a genuinely private object; the filesystem store
 * streams the bytes instead.
 */
export interface AttendancePhotoStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array>
  delete(keys: string[]): Promise<void>
  signedGetUrl?: (key: string, expiresInSeconds: number) => Promise<string>
}

export type AttendancePhotoBackend = 'r2' | 'filesystem'

/**
 * `ATTENDANCE_PHOTO_STORAGE` wins; otherwise a dedicated bucket selects R2, and
 * development falls back to the filesystem. Production without a dedicated
 * bucket is deliberately "not configured" rather than writing identity photos
 * to an ephemeral disk.
 */
export function attendancePhotoBackend(env: NodeJS.ProcessEnv = process.env): AttendancePhotoBackend | null {
  const explicit = env.ATTENDANCE_PHOTO_STORAGE?.trim()
  if (explicit === 'r2') return 'r2'
  if (explicit === 'filesystem') return 'filesystem'
  if (explicit) return null
  if (env.ATTENDANCE_PHOTO_BUCKET?.trim()) return 'r2'
  return env.NODE_ENV === 'production' ? null : 'filesystem'
}

/**
 * Why photo storage cannot be used, or `null` when it can. The bucket must be
 * separate from the public event-photo bucket: that one is served through
 * `VITE_R2_PUBLIC_URL`, and an ID photo must never be reachable that way.
 */
export function attendancePhotoStoreProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const backend = attendancePhotoBackend(env)
  if (backend === null) {
    return env.ATTENDANCE_PHOTO_STORAGE?.trim()
      ? `Unknown ATTENDANCE_PHOTO_STORAGE value: ${env.ATTENDANCE_PHOTO_STORAGE.trim()}`
      : 'Attendance photo storage is not configured'
  }
  if (backend === 'filesystem') return null

  const bucket = env.ATTENDANCE_PHOTO_BUCKET?.trim()
  if (!bucket) return 'ATTENDANCE_PHOTO_BUCKET is not configured'
  const config = r2Config()
  if (!config) return 'R2 credentials are not configured'
  if (bucket === config.bucket) {
    return 'ATTENDANCE_PHOTO_BUCKET must be a dedicated private bucket, not the public event-photo bucket'
  }
  return null
}

function filesystemAttendancePhotoStore(env: NodeJS.ProcessEnv): AttendancePhotoStore {
  const root = resolve(env.ATTENDANCE_PHOTO_STORAGE_DIR ?? '.local/attendance-photos')
  const pathOf = (key: string) => {
    const target = resolve(root, key)
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error('Refusing to access a photo outside the attendance-photo store')
    }
    return target
  }
  return {
    async put(key, bytes) {
      const target = pathOf(key)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
    },
    async get(key) {
      return new Uint8Array(await readFile(pathOf(key)))
    },
    async delete(keys) {
      for (const key of keys) await rm(pathOf(key), { force: true })
    }
  }
}

function r2AttendancePhotoStore(bucket: string): AttendancePhotoStore | null {
  const config = r2Config()
  if (!config) return null
  const client = r2Client(config)
  return {
    async put(key, bytes, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType
      }))
    },
    async get(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      if (!response.Body) throw new Error(`Attendance photo ${key} has no body`)
      return new Uint8Array(await response.Body.transformToByteArray())
    },
    async delete(keys) {
      if (keys.length === 0) return
      await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map(Key => ({ Key })) }
      }))
    },
    async signedGetUrl(key, expiresInSeconds) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: expiresInSeconds }
      )
    }
  }
}

/** The private store, or `null` when this environment cannot hold photos safely. */
export function attendancePhotoStore(env: NodeJS.ProcessEnv = process.env): AttendancePhotoStore | null {
  const backend = attendancePhotoBackend(env)
  if (backend === 'filesystem') return filesystemAttendancePhotoStore(env)
  if (backend === 'r2' && !attendancePhotoStoreProblem(env)) {
    return r2AttendancePhotoStore(env.ATTENDANCE_PHOTO_BUCKET!.trim())
  }
  return null
}

/* --------------------------------------------------------------- photo purge */

export interface AttendancePhotoPurgeResult {
  purged: number
  /** Photos due for deletion but left in place because storage was unreachable. */
  skipped: number
}

/**
 * Deletes every photo whose retention has run out. Objects go first: if storage
 * throws, the rows stay pointing at them and the next daily run retries. Only a
 * successful delete clears the row, and the attendance row itself is never
 * touched beyond those three photo columns.
 */
export async function runAttendancePhotoPurge(
  db: typeof prisma,
  store: AttendancePhotoStore | null,
  now: Date = new Date()
): Promise<AttendancePhotoPurgeResult> {
  const due = await db.attendance.findMany({
    where: {
      photoKey: { not: null },
      OR: [{ photoExpiresAt: { lte: now } }, { photoExpiresAt: null }]
    },
    select: { id: true, photoKey: true }
  })
  if (due.length === 0) return { purged: 0, skipped: 0 }

  const keys = due
    .map(row => row.photoKey)
    .filter((key): key is string => isAttendancePhotoKey(key))
  if (!store) return { purged: 0, skipped: keys.length }

  await store.delete(keys)
  const result = await db.attendance.updateMany({
    where: { id: { in: due.map(row => row.id) }, photoKey: { in: keys } },
    data: { photoKey: null, photoCapturedAt: null, photoExpiresAt: null }
  })
  return { purged: result.count, skipped: keys.length - result.count }
}
