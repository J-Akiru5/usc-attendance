import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { r2Client, r2Config } from './r2'

/**
 * Where signature images live (plan §11.1's storage math: ~150 MB per semester
 * of PNGs in a 500 MB database).
 *
 * `SIGNATURE_STORAGE=db` (the default) keeps the bytes in Postgres exactly as
 * before; `r2` writes them to object storage and leaves the row holding the
 * object key, the SHA-256 reference and the timestamps. Readers go by the ROW,
 * not by the current setting, so both generations keep working side by side and
 * switching the env var is reversible.
 */
export type SignatureBackend = 'db' | 'r2' | 'filesystem'

export function signatureBackend(): SignatureBackend {
  if (process.env.SIGNATURE_STORAGE === 'r2') return 'r2'
  if (process.env.SIGNATURE_STORAGE === 'filesystem') return 'filesystem'
  return 'db'
}

export function signatureObjectKey(attendanceId: string): string {
  return `signatures/${attendanceId}.png`
}

export interface SignatureObjectStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array>
  delete(keys: string[]): Promise<void>
}

/** The real store, or null when R2 is not configured in this environment. */
export function r2SignatureStore(): SignatureObjectStore | null {
  const config = r2Config()
  if (!config) return null
  const client = r2Client(config)
  return {
    async put(key, bytes, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType
      }))
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
      if (!res.Body) throw new Error(`Signature object ${key} has no body`)
      return new Uint8Array(await res.Body.transformToByteArray())
    },
    async delete(keys) {
      if (keys.length === 0) return
      await client.send(new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: { Objects: keys.map(Key => ({ Key })) }
      }))
    }
  }
}

/**
 * A directory-backed store for development and the live e2e suites: it exercises
 * exactly the same "image lives outside the database" code path as R2 (write,
 * read for exports, delete on purge) without needing cloud credentials.
 */
export function filesystemSignatureStore(dir: string): SignatureObjectStore {
  const root = resolve(dir)
  const pathOf = (key: string) => resolve(root, key)

  return {
    async put(key, bytes) {
      const target = pathOf(key)
      if (!target.startsWith(root)) throw new Error('Refusing to write outside the signature store')
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
    },
    async get(key) {
      return new Uint8Array(await readFile(pathOf(key)))
    },
    async delete(keys) {
      for (const key of keys) {
        await rm(pathOf(key), { force: true })
      }
    }
  }
}

/** The store for the configured backend (null for `db`, or for `r2` without credentials). */
export function signatureStore(): SignatureObjectStore | null {
  if (signatureBackend() === 'filesystem') {
    return filesystemSignatureStore(process.env.SIGNATURE_STORAGE_DIR ?? '.signature-store')
  }
  if (signatureBackend() === 'r2') return r2SignatureStore()
  return null
}

export interface StoreSignatureResult {
  /** Bytes to keep in Postgres, or null when the image went to R2. */
  png: Uint8Array | null
  storageKey: string | null
  storageBackend: SignatureBackend
}

/**
 * Stores one signature image according to the configured backend. A missing
 * store while object storage is requested is a configuration error the caller
 * must see, not a silent fallback to the database.
 */
export async function storeSignature(
  store: SignatureObjectStore | null,
  attendanceId: string,
  png: Uint8Array
): Promise<StoreSignatureResult> {
  const backend = signatureBackend()
  if (backend === 'db') {
    return { png, storageKey: null, storageBackend: 'db' }
  }
  if (!store) {
    throw new Error(`Signature storage is not configured (SIGNATURE_STORAGE=${backend} but no store is available)`)
  }
  const key = signatureObjectKey(attendanceId)
  await store.put(key, png, 'image/png')
  return { png: null, storageKey: key, storageBackend: backend }
}

export interface SignatureRowLike {
  png: Uint8Array | null
  storageKey?: string | null
}

/**
 * The image for one signature row: from object storage when the row points
 * there, otherwise the bytes in Postgres (or null when purged/expired).
 */
export async function readSignaturePng(
  store: SignatureObjectStore | null,
  row: SignatureRowLike
): Promise<Uint8Array | null> {
  if (row.storageKey) {
    if (!store) {
      throw new Error('Signature storage is not configured but a signature row points at object storage')
    }
    return store.get(row.storageKey)
  }
  return row.png ? new Uint8Array(row.png) : null
}
