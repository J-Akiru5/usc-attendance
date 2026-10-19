import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { r2SignatureStore } from './signature-storage'

/**
 * Where document attachments live (plan §8.8). Object storage when R2 is
 * configured — the same bucket the signatures and excuse files use, under a
 * `documents/` prefix — and the filesystem in development and the live e2e
 * suites. Deliberately **no database backend** (§11.1: binaries do not belong
 * in a 500 MB database). When no store is configured an attachment cannot be
 * added, and the API says so instead of pretending.
 */
export interface DocumentStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array>
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg'
}

/** `documents/<uuid>.<ext>` — the key never comes from the uploaded name. */
export function documentObjectKey(attachmentId: string, mime: string): string {
  const extension = EXTENSIONS[mime] ?? 'bin'
  return `documents/${attachmentId}.${extension}`
}

export function documentStoragePath(): string {
  return resolve(process.env.DOCUMENT_STORAGE_PATH ?? '.local/documents')
}

function filesystemStore(): DocumentStorage {
  const root = documentStoragePath()
  return {
    async put(key, bytes) {
      const target = resolve(root, key)
      if (!target.startsWith(root)) throw new Error('Refusing to write outside the document store')
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
    },
    async get(key) {
      return new Uint8Array(await readFile(resolve(root, key)))
    }
  }
}

/** The store to write to, or null when nothing is configured to hold bytes. */
export function documentStorage(): DocumentStorage | null {
  const r2 = r2SignatureStore()
  if (r2) return r2
  if (process.env.DOCUMENT_STORAGE === 'off') return null
  return filesystemStore()
}
