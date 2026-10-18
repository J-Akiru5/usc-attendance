import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  filesystemSignatureStore,
  readSignaturePng,
  signatureBackend,
  signatureObjectKey,
  storeSignature,
  type SignatureObjectStore
} from '../../server/utils/signature-storage'

function fakeStore() {
  const objects = new Map<string, Uint8Array>()
  const deleted: string[] = []
  const store: SignatureObjectStore = {
    put: async (key, bytes) => {
      objects.set(key, bytes)
    },
    get: async (key) => {
      const value = objects.get(key)
      if (!value) throw new Error(`missing ${key}`)
      return value
    },
    delete: async (keys) => {
      deleted.push(...keys)
      for (const key of keys) objects.delete(key)
    }
  }
  return { store, objects, deleted }
}

function withBackend<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.SIGNATURE_STORAGE
  if (value === undefined) delete process.env.SIGNATURE_STORAGE
  else process.env.SIGNATURE_STORAGE = value
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.SIGNATURE_STORAGE
    else process.env.SIGNATURE_STORAGE = previous
  }
}

async function withBackendAsync<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.SIGNATURE_STORAGE
  if (value === undefined) delete process.env.SIGNATURE_STORAGE
  else process.env.SIGNATURE_STORAGE = value
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.SIGNATURE_STORAGE
    else process.env.SIGNATURE_STORAGE = previous
  }
}

describe('signatureBackend', () => {
  it('is the database unless asked for object storage', () => {
    expect(withBackend(undefined, signatureBackend)).toBe('db')
    expect(withBackend('db', signatureBackend)).toBe('db')
    expect(withBackend('r2', signatureBackend)).toBe('r2')
    expect(withBackend('filesystem', signatureBackend)).toBe('filesystem')
    expect(withBackend('R2', signatureBackend)).toBe('db')
  })
})

describe('signatureObjectKey', () => {
  it('is deterministic and namespaced per attendance row', () => {
    expect(signatureObjectKey('abc-123')).toBe('signatures/abc-123.png')
    expect(signatureObjectKey('abc-123')).toBe(signatureObjectKey('abc-123'))
    expect(signatureObjectKey('abc-123')).not.toBe(signatureObjectKey('abc-124'))
  })
})

describe('storeSignature', () => {
  it('keeps the bytes in the database by default', async () => {
    const { store, objects } = fakeStore()
    const result = await withBackend(undefined, () => storeSignature(store, 'a1', new Uint8Array([1, 2, 3])))
    expect(result.storageBackend).toBe('db')
    expect(result.storageKey).toBeNull()
    expect(result.png).toEqual(new Uint8Array([1, 2, 3]))
    expect(objects.size).toBe(0)
  })

  it('writes to object storage when asked, leaving no bytes behind', async () => {
    const { store, objects } = fakeStore()
    const bytes = new Uint8Array([9, 9])
    const result = await withBackendAsync('r2', () => storeSignature(store, 'a2', bytes))
    expect(result.storageBackend).toBe('r2')
    expect(result.png).toBeNull()
    expect(result.storageKey).toBe('signatures/a2.png')
    expect(objects.get('signatures/a2.png')).toEqual(bytes)
  })

  it('writes to the filesystem store under the same contract', async () => {
    const { store, objects } = fakeStore()
    const result = await withBackendAsync('filesystem', () => storeSignature(store, 'a2b', new Uint8Array([5])))
    expect(result.storageBackend).toBe('filesystem')
    expect(result.png).toBeNull()
    expect(result.storageKey).toBe('signatures/a2b.png')
    expect(objects.has('signatures/a2b.png')).toBe(true)
  })

  it('refuses to pretend it stored an image when object storage is requested but not configured', async () => {
    await withBackendAsync('r2', async () => {
      await expect(storeSignature(null, 'a3', new Uint8Array([1]))).rejects.toThrow(/not configured/)
    })
    await withBackendAsync('filesystem', async () => {
      await expect(storeSignature(null, 'a3', new Uint8Array([1]))).rejects.toThrow(/not configured/)
    })
  })
})

describe('readSignaturePng', () => {
  it('reads object storage when the row points there', async () => {
    const { store } = fakeStore()
    await store.put('signatures/a4.png', new Uint8Array([7, 7, 7]), 'image/png')
    const png = await readSignaturePng(store, { png: null, storageKey: 'signatures/a4.png' })
    expect(png).toEqual(new Uint8Array([7, 7, 7]))
  })

  it('falls back to the database bytes for rows written before the switch', async () => {
    const { store } = fakeStore()
    const png = await readSignaturePng(store, { png: new Uint8Array([4, 5]), storageKey: null })
    expect(png).toEqual(new Uint8Array([4, 5]))
  })

  it('returns null for a purged row', async () => {
    const { store } = fakeStore()
    expect(await readSignaturePng(store, { png: null, storageKey: null })).toBeNull()
  })

  it('fails loudly when a row points at storage that is not configured', async () => {
    await expect(readSignaturePng(null, { png: null, storageKey: 'signatures/a5.png' })).rejects.toThrow(/not configured/)
  })
})

describe('filesystemSignatureStore', () => {
  it('round-trips bytes and deletes them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sig-store-'))
    try {
      const store = filesystemSignatureStore(dir)
      await store.put(signatureObjectKey('fs-1'), new Uint8Array([1, 2, 3]), 'image/png')
      expect(await store.get(signatureObjectKey('fs-1'))).toEqual(new Uint8Array([1, 2, 3]))

      await store.delete([signatureObjectKey('fs-1')])
      await expect(store.get(signatureObjectKey('fs-1'))).rejects.toThrow()
      // deleting something already gone stays quiet (purge retries)
      await expect(store.delete([signatureObjectKey('fs-1')])).resolves.toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses keys that would escape the store directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sig-store-'))
    try {
      const store = filesystemSignatureStore(dir)
      await expect(store.put('../escape.png', new Uint8Array([1]), 'image/png')).rejects.toThrow(/outside/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
