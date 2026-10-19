import { badRequest } from './http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { r2SignatureStore } from './signature-storage'

/**
 * Where finance files live (plan §8.7): expense receipts and the signed copies
 * of the external noting/approval steps. Object storage when R2 is configured —
 * the same bucket the signatures and excuse attachments use, under a `finance/`
 * prefix — and the filesystem in development and e2e.
 *
 * Deliberately **no database backend**: §11.1's storage math is the whole reason
 * uploads left Postgres, and a receipt is no different from a signature.
 */
export interface FinanceStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array>
}

/** A receipt belongs to one entry, a signed copy to one proposal step. */
export function financeObjectKey(scope: 'receipt' | 'signed', id: string, mime: string): string {
  const extension = mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : 'png'
  return `finance/${scope}/${id}.${extension}`
}

function filesystemStore(): FinanceStorage {
  const root = resolve(process.env.FINANCE_STORAGE_PATH ?? '.local/finance')
  return {
    async put(key, bytes) {
      const path = resolve(root, key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
    },
    async get(key) {
      return new Uint8Array(await readFile(resolve(root, key)))
    }
  }
}

/** The store to write to (never null: the filesystem is always available). */
export function financeStorage(): FinanceStorage {
  return r2SignatureStore() ?? filesystemStore()
}

/** PNG, JPEG or PDF up to 5 MB — the same list as the excuse attachments. */
export const FINANCE_FILE_MIMES = ['image/png', 'image/jpeg', 'application/pdf'] as const
export const FINANCE_FILE_MAX_BYTES = 5 * 1024 * 1024

/** Validates a file the caller sent as `{ mime, dataBase64, name? }`. */
export function readUploadedFile(input: unknown, label: string): {
  bytes: Uint8Array
  mime: string
  size: number
  name: string | null
} | null {
  if (input === undefined || input === null) return null
  if (typeof input !== 'object') throw badRequest(`${label} must be an object with mime and dataBase64`)

  const payload = input as { mime?: unknown, dataBase64?: unknown, name?: unknown }
  const mime = String(payload.mime ?? '')
  if (!(FINANCE_FILE_MIMES as readonly string[]).includes(mime)) {
    throw badRequest(`${label} must be one of ${FINANCE_FILE_MIMES.join(', ')}`)
  }
  const data = typeof payload.dataBase64 === 'string' ? payload.dataBase64 : ''
  if (!data) throw badRequest(`${label} needs dataBase64`)

  const bytes = new Uint8Array(Buffer.from(data, 'base64'))
  if (bytes.length < 1 || bytes.length > FINANCE_FILE_MAX_BYTES) {
    throw badRequest(`${label} must be between 1 byte and 5 MB`)
  }
  return {
    bytes,
    mime,
    size: bytes.length,
    name: typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name.trim().slice(0, 160) : null
  }
}
