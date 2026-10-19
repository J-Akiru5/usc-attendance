import { describe, expect, it } from 'vitest'
import {
  MAX_REDACTION_NOTE,
  attachmentIsPubliclyReadable,
  documentIsPubliclyReadable,
  publicDocumentContent,
  publicDocumentWhere,
  publishAudit,
  publishRequiresConfirmation,
  redactedCopyIsStale,
  requestedClassification,
  resolvePublicDocumentSource,
  validateClassification,
  validateRedactedCopy,
  validateRedactionNote,
  visibilityForClassification
} from '../../server/utils/documents'

/**
 * Benchmark amendment BC-9 (plan §8.8, §11.2). The acceptance is deliberately
 * small and testable: a public document with a redacted copy serves the redacted
 * text and never the original phrase; a restricted document returns nothing
 * publicly; publishing is audited (the audit shape lives in `publishAudit`).
 */

const originalBody = 'Present: Maria Santos, Treasurer. Motion carried.'
const redactedBody = 'Present: [student name redacted], Treasurer. Motion carried.'

describe('classification', () => {
  it('defaults to officers and accepts the three audiences', () => {
    expect(validateClassification(undefined)).toBe('officers')
    expect(validateClassification('public')).toBe('public')
    expect(validateClassification('officers')).toBe('officers')
    expect(validateClassification('restricted')).toBe('restricted')
  })

  it('refuses an audience nobody defined', () => {
    expect(() => validateClassification('everyone')).toThrow(/classification/i)
    expect(() => validateClassification('students')).toThrow(/classification/i)
  })

  it('keeps the legacy visibility mirror in step', () => {
    expect(visibilityForClassification('public')).toBe('public')
    expect(visibilityForClassification('officers')).toBe('officers')
    expect(visibilityForClassification('restricted')).toBe('officers')
  })

  it('reads a create request that still sends visibility', () => {
    expect(requestedClassification({ visibility: 'public' })).toBe('public')
    expect(requestedClassification({ visibility: 'officers' })).toBe('officers')
    expect(requestedClassification({})).toBe('officers')
    expect(requestedClassification({ classification: 'restricted', visibility: 'public' })).toBe('restricted')
  })
})

describe('resolvePublicDocumentSource', () => {
  it('serves the original when no redacted copy is in force', () => {
    expect(resolvePublicDocumentSource({
      classification: 'public',
      hasRedactedCopy: false,
      currentVersion: 3
    })).toEqual({ readable: true, source: 'original', version: 3, reason: null })
  })

  it('serves the redacted copy, never the original, once one exists', () => {
    expect(resolvePublicDocumentSource({
      classification: 'public',
      hasRedactedCopy: true,
      currentVersion: 4,
      redactedVersion: 5
    })).toEqual({ readable: true, source: 'redacted', version: 5, reason: null })
  })

  it('never serves a restricted or officers-only document', () => {
    expect(resolvePublicDocumentSource({ classification: 'restricted', hasRedactedCopy: false, currentVersion: 1 }))
      .toMatchObject({ readable: false, source: 'none', reason: 'not_published' })
    expect(resolvePublicDocumentSource({ classification: 'officers', hasRedactedCopy: true, redactedVersion: 2, currentVersion: 1 }))
      .toMatchObject({ readable: false, source: 'none', reason: 'not_published' })
  })

  it('hides an archived public document', () => {
    expect(resolvePublicDocumentSource({ classification: 'public', archived: true, hasRedactedCopy: false, currentVersion: 1 }))
      .toMatchObject({ readable: false, reason: 'archived' })
  })

  it('fails closed when the redacted pointer does not resolve', () => {
    expect(resolvePublicDocumentSource({
      classification: 'public',
      hasRedactedCopy: true,
      redactedVersion: null,
      currentVersion: 2
    })).toMatchObject({ readable: false, reason: 'no_public_copy' })
  })

  it('serves only the published version when one is requested explicitly', () => {
    expect(resolvePublicDocumentSource({
      classification: 'public',
      hasRedactedCopy: true,
      redactedVersion: 5,
      currentVersion: 4,
      requestedVersion: 5
    })).toMatchObject({ readable: true, source: 'redacted', version: 5 })
    expect(resolvePublicDocumentSource({
      classification: 'public',
      hasRedactedCopy: true,
      redactedVersion: 5,
      currentVersion: 4,
      requestedVersion: 4
    })).toMatchObject({ readable: false, reason: 'version_not_public' })
  })
})

describe('publicDocumentContent — the acceptance case', () => {
  it('a public document with a redacted copy serves the copy and never the original phrase', () => {
    const served = publicDocumentContent({
      classification: 'public',
      currentVersion: 2,
      title: 'Minutes of the regular session',
      body: originalBody,
      tags: ['minutes'],
      hasRedactedCopy: true,
      redactedVersion: { version: 3, title: 'Minutes of the regular session', body: redactedBody, tags: ['minutes'] }
    })

    expect(served.public).toBe(true)
    if (!served.public) throw new Error('the copy should be readable')
    expect(served.source).toBe('redacted')
    expect(served.body).toBe(redactedBody)
    expect(served.body).not.toContain('Maria Santos')
  })

  it('a restricted document returns nothing publicly at all', () => {
    const served = publicDocumentContent({
      classification: 'restricted',
      currentVersion: 1,
      title: 'Closed session minutes',
      body: originalBody,
      tags: [],
      hasRedactedCopy: false
    })
    expect(served).toEqual({ public: false, reason: 'not_published', version: null })
    expect('body' in served).toBe(false)
  })

  it('serves the original when the council has not needed a copy', () => {
    const served = publicDocumentContent({
      classification: 'public',
      currentVersion: 2,
      title: 'Resolution on the budget',
      body: 'No personal data here.',
      tags: ['budget'],
      hasRedactedCopy: false
    })
    expect(served).toMatchObject({ public: true, source: 'original', version: 2, body: 'No personal data here.' })
  })

  it('does not fall back to the original when the copy is missing', () => {
    const served = publicDocumentContent({
      classification: 'public',
      currentVersion: 2,
      title: 'Minutes',
      body: originalBody,
      tags: [],
      hasRedactedCopy: true,
      redactedVersion: null
    })
    expect(served.public).toBe(false)
  })
})

describe('publishing', () => {
  it('needs confirmation only when a newly public filing has no redacted copy', () => {
    expect(publishRequiresConfirmation({ from: 'officers', to: 'public', hasRedactedCopy: false })).toBe(true)
    expect(publishRequiresConfirmation({ from: 'restricted', to: 'public', hasRedactedCopy: false })).toBe(true)
    expect(publishRequiresConfirmation({ from: 'officers', to: 'public', hasRedactedCopy: true })).toBe(false)
    expect(publishRequiresConfirmation({ from: 'public', to: 'public', hasRedactedCopy: false })).toBe(false)
    expect(publishRequiresConfirmation({ from: 'officers', to: 'restricted', hasRedactedCopy: false })).toBe(false)
  })

  it('names the safe publish and flags an unredacted one', () => {
    expect(publishAudit({ from: 'officers', to: 'public', hasRedactedCopy: true })).toEqual({
      action: 'document_published',
      redactedCopyInForce: true,
      warning: null
    })
    const loud = publishAudit({ from: 'officers', to: 'public', hasRedactedCopy: false })
    expect(loud?.action).toBe('document_published_unredacted')
    expect(loud?.redactedCopyInForce).toBe(false)
    expect(loud?.warning).toMatch(/no unauthorised student name/i)
  })

  it('is not an audit event when nothing is being published', () => {
    expect(publishAudit({ from: 'public', to: 'public', hasRedactedCopy: false })).toBeNull()
    expect(publishAudit({ from: 'public', to: 'officers', hasRedactedCopy: true })).toBeNull()
    expect(publishAudit({ from: 'officers', to: 'restricted', hasRedactedCopy: false })).toBeNull()
  })
})

describe('validateRedactionNote', () => {
  it('requires a note and trims it', () => {
    expect(validateRedactionNote('  Removed three student names  ')).toBe('Removed three student names')
    expect(() => validateRedactionNote('   ')).toThrow(/redaction note/i)
    expect(() => validateRedactionNote(undefined)).toThrow(/redaction note/i)
  })

  it('bounds the note', () => {
    expect(() => validateRedactionNote('x'.repeat(MAX_REDACTION_NOTE + 1))).toThrow(/too long/i)
  })
})

describe('validateRedactedCopy', () => {
  const current = { title: 'Minutes', body: originalBody, tags: ['minutes'] }

  it('accepts replacement text and keeps the other fields', () => {
    expect(validateRedactedCopy({ body: redactedBody }, current)).toEqual({
      mode: 'replacement',
      title: 'Minutes',
      body: redactedBody,
      tags: ['minutes'],
      confirmedExistingTextSafe: false
    })
  })

  it('accepts a confirmation that the current text is already safe', () => {
    expect(validateRedactedCopy({ confirmExistingTextSafe: true }, current)).toEqual({
      mode: 'confirmed',
      title: 'Minutes',
      body: originalBody,
      tags: ['minutes'],
      confirmedExistingTextSafe: true
    })
  })

  it('accepts an attachment as the redacted copy', () => {
    const copy = validateRedactedCopy({}, current, true)
    expect(copy.mode).toBe('replacement')
    expect(copy.body).toBe('')
  })

  it('refuses neither and refuses both', () => {
    expect(() => validateRedactedCopy({}, current)).toThrow(/supply the redacted text/i)
    expect(() => validateRedactedCopy({ body: redactedBody, confirmExistingTextSafe: true }, current))
      .toThrow(/choose one/i)
  })

  it('takes a new title and tags when supplied', () => {
    const copy = validateRedactedCopy({ body: redactedBody, title: 'Public minutes', tags: 'Minutes, Public' }, current)
    expect(copy.title).toBe('Public minutes')
    expect(copy.tags).toEqual(['minutes', 'public'])
  })

  it('refuses a body that is too long', () => {
    expect(() => validateRedactedCopy({ body: 'x'.repeat(60_001) }, current)).toThrow(/too long/i)
  })
})

describe('attachmentIsPubliclyReadable', () => {
  it('refuses everything on a restricted or officers-only document', () => {
    expect(attachmentIsPubliclyReadable({ classification: 'restricted' })).toBe(false)
    expect(attachmentIsPubliclyReadable({ classification: 'officers' })).toBe(false)
  })

  it('refuses everything on an archived public document', () => {
    expect(attachmentIsPubliclyReadable({ classification: 'public', archived: true })).toBe(false)
  })

  it('serves any file of a public document that has no redacted copy', () => {
    expect(attachmentIsPubliclyReadable({ classification: 'public', attachmentVersionId: 'v1' })).toBe(true)
  })

  it('serves only the redacted copy’s own files once one is in force', () => {
    expect(attachmentIsPubliclyReadable({
      classification: 'public',
      redactedVersionId: 'v5',
      attachmentVersionId: 'v5'
    })).toBe(true)
    expect(attachmentIsPubliclyReadable({
      classification: 'public',
      redactedVersionId: 'v5',
      attachmentVersionId: 'v1'
    })).toBe(false)
  })
})

describe('the rest of the archive rules', () => {
  it('treats classification as authoritative over the legacy mirror', () => {
    expect(documentIsPubliclyReadable({ classification: 'restricted', visibility: 'public' })).toBe(false)
    expect(documentIsPubliclyReadable({ classification: 'public', visibility: 'officers' })).toBe(true)
    expect(documentIsPubliclyReadable({ visibility: 'public' })).toBe(true)
  })

  it('builds a public filter that can never include a restricted row', () => {
    expect(publicDocumentWhere({ archived: 'active', year: 2026 }))
      .toEqual({ classification: 'public', archived: false, year: 2026 })
  })

  it('marks a copy stale when the original has moved on', () => {
    expect(redactedCopyIsStale({ redactedVersion: 3, currentVersion: 2 })).toBe(false)
    expect(redactedCopyIsStale({ redactedVersion: 3, currentVersion: 4 })).toBe(true)
    expect(redactedCopyIsStale({ redactedVersion: null, currentVersion: 4 })).toBe(false)
  })
})
