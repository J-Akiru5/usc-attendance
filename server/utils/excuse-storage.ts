import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { r2SignatureStore } from './signature-storage'

/**
 * Where excuse attachments live (plan §8.5). Object storage when R2 is
 * configured — the same bucket the signatures use, under an `excuses/` prefix —
 * and the filesystem in development and e2e. Deliberately **no database
 * backend**: the whole point of the signature move (§11.1) was to stop growing
 * the database with binaries, and an excuse is no different. When neither is
 * available the request can still be filed without an attachment.
 */
export interface ExcuseStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array>
}

export function excuseObjectKey(excuseId: string, mime: string): string {
  const extension = mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : 'png'
  return `excuses/${excuseId}.${extension}`
}

function filesystemStore(): ExcuseStorage {
  const root = resolve(process.env.EXCUSE_STORAGE_PATH ?? '.local/excuses')
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

/** The store to write to, or null when nothing is configured to hold bytes. */
export function excuseStorage(): ExcuseStorage | null {
  const r2 = r2SignatureStore()
  if (r2) return r2
  return filesystemStore()
}
