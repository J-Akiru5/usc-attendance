import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_ATTACHMENT_MAX_BYTES,
  MAX_SEARCH_TEXT,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  buildSearchQuery,
  decodeTextAttachment,
  documentIsPubliclyReadable,
  documentListWhere,
  documentSearchText,
  documentSummary,
  formatDocumentNumber,
  hasContentChange,
  nextVersion,
  normalizeTags,
  parseArchivedFilter,
  parseDocumentScope,
  parseYear,
  validateAttachmentMeta,
  validateChangeNote,
  validateDocumentContent,
  validateDocumentType,
  validateFinanceRef,
  validateNewDocumentType
} from '../../server/utils/documents'

const resolution = { prefix: 'Resolution No.', pad: 3 }

describe('formatDocumentNumber', () => {
  it('files the plan\'s example', () => {
    expect(formatDocumentNumber(resolution, 2026, 14)).toBe('Resolution No. 2026-014')
  })

  it('pads to the type\'s width and honours a wider one', () => {
    expect(formatDocumentNumber({ prefix: 'Memo No.', pad: 1 }, 2026, 7)).toBe('Memo No. 2026-7')
    expect(formatDocumentNumber({ prefix: 'Memo No.', pad: 4 }, 2026, 7)).toBe('Memo No. 2026-0007')
  })

  it('never overflows the padding for a large sequence', () => {
    expect(formatDocumentNumber(resolution, 2026, 1234)).toBe('Resolution No. 2026-1234')
  })

  it('refuses a year or sequence that cannot be a filing', () => {
    expect(() => formatDocumentNumber(resolution, 0, 1)).toThrow(/year/i)
    expect(() => formatDocumentNumber(resolution, 2026, 0)).toThrow(/sequence/i)
    expect(() => formatDocumentNumber(resolution, 2026, 1.5)).toThrow(/sequence/i)
  })
})

describe('parseYear', () => {
  it('keeps the fallback when nothing is asked for', () => {
    expect(parseYear(undefined, 2026)).toBe(2026)
    expect(parseYear('', 2026)).toBe(2026)
  })

  it('accepts a filed year', () => {
    expect(parseYear('2025', 2026)).toBe(2025)
    expect(parseYear(2024, 2026)).toBe(2024)
  })

  it('refuses nonsense', () => {
    expect(() => parseYear('last year', 2026)).toThrow(/four-digit year/i)
    expect(() => parseYear('1200', 2026)).toThrow(/four-digit year/i)
  })
})

describe('nextVersion', () => {
  it('counts up from the current version', () => {
    expect(nextVersion(1)).toBe(2)
    expect(nextVersion(9)).toBe(10)
  })
})

describe('normalizeTags', () => {
  it('lowercases, trims and de-duplicates', () => {
    expect(normalizeTags([' Budget ', 'budget', 'Fund-Raising'])).toEqual(['budget', 'fund-raising'])
  })

  it('takes a comma-separated string, as a form sends it', () => {
    expect(normalizeTags('budget,  finance ,,')).toEqual(['budget', 'finance'])
  })

  it('drops empty tags and caps how many and how long', () => {
    expect(normalizeTags(['', '   ', null])).toEqual([])
    expect(normalizeTags(['x'.repeat(100)])[0]).toHaveLength(MAX_TAG_LENGTH)
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `tag${i}`))).toHaveLength(MAX_TAGS)
  })

  it('collapses inner whitespace so a tag is a stable filter key', () => {
    expect(normalizeTags(['year   end report'])).toEqual(['year end report'])
  })
})

describe('validateDocumentContent', () => {
  it('accepts a filing and trims the title', () => {
    const content = validateDocumentContent({
      title: '  Regular session minutes  ',
      body: 'Called to order at 9:00 AM.',
      tags: ['session'],
      visibility: 'public'
    })
    expect(content).toEqual({
      title: 'Regular session minutes',
      body: 'Called to order at 9:00 AM.',
      tags: ['session'],
      visibility: 'public'
    })
  })

  it('defaults to officers-only', () => {
    expect(validateDocumentContent({ title: 'Internal memo' }).visibility).toBe('officers')
  })

  it('allows a filing whose text is only in the attachment', () => {
    expect(validateDocumentContent({ title: 'Scanned minutes' }).body).toBe('')
  })

  it('refuses a title that is too short, too long or missing', () => {
    expect(() => validateDocumentContent({ title: 'ok' })).toThrow(/title/i)
    expect(() => validateDocumentContent({ title: 'x'.repeat(201) })).toThrow(/title/i)
    expect(() => validateDocumentContent({})).toThrow(/title/i)
  })

  it('refuses a visibility nobody can read', () => {
    expect(() => validateDocumentContent({ title: 'Secret minutes', visibility: 'everyone' })).toThrow(/visibility/i)
  })

  it('inherits what a new version did not send', () => {
    const content = validateDocumentContent({ body: 'Amended §3.' }, {
      title: 'By-laws',
      body: 'Original §3.',
      tags: ['by-laws'],
      visibility: 'public'
    })
    expect(content).toEqual({ title: 'By-laws', body: 'Amended §3.', tags: ['by-laws'], visibility: 'public' })
  })

  it('caps the body', () => {
    expect(() => validateDocumentContent({ title: 'Long one', body: 'x'.repeat(60_001) })).toThrow(/too long/i)
  })
})

describe('validateChangeNote and validateFinanceRef', () => {
  it('keeps a short note and treats an empty one as none', () => {
    expect(validateChangeNote('  typo in §3 ')).toBe('typo in §3')
    expect(validateChangeNote('   ')).toBeNull()
    expect(() => validateChangeNote('x'.repeat(501))).toThrow(/change note/i)
  })

  it('keeps a finance reference and clears an empty one', () => {
    expect(validateFinanceRef(' BL-2026-004 ')).toBe('BL-2026-004')
    expect(validateFinanceRef('')).toBeNull()
    expect(() => validateFinanceRef('x'.repeat(121))).toThrow(/finance reference/i)
  })
})

describe('validateDocumentType', () => {
  it('accepts a full type', () => {
    expect(validateDocumentType({ name: 'Resolution', prefix: 'Resolution No.', pad: 3 }))
      .toEqual({ name: 'Resolution', prefix: 'Resolution No.', pad: 3 })
  })

  it('defaults the padding and refuses nonsense', () => {
    expect(validateDocumentType({ name: 'Minutes', prefix: 'Minutes No.' }).pad).toBe(3)
    expect(() => validateDocumentType({ name: 'M', prefix: 'Minutes No.' })).toThrow(/name/i)
    expect(() => validateDocumentType({ name: 'Minutes', prefix: 'x' })).toThrow(/prefix/i)
    expect(() => validateDocumentType({ name: 'Minutes', prefix: 'Minutes No.', pad: 0 })).toThrow(/pad/i)
    expect(() => validateDocumentType({ name: 'Minutes', prefix: 'Minutes No.', pad: 7 })).toThrow(/pad/i)
  })

  it('slugifies a new type key and refuses one that exists', () => {
    expect(validateNewDocumentType({ key: ' Executive Order ', name: 'Executive order', prefix: 'EO No.' }))
      .toMatchObject({ key: 'executive-order' })
    expect(() => validateNewDocumentType({ key: 'resolution', name: 'Resolution', prefix: 'Resolution No.' }))
      .toThrow(/already exists/i)
  })
})

describe('validateAttachmentMeta', () => {
  it('accepts the kinds an archive holds', () => {
    expect(validateAttachmentMeta('application/pdf', 1024, 'minutes.pdf'))
      .toEqual({ mime: 'application/pdf', size: 1024, fileName: 'minutes.pdf' })
    expect(validateAttachmentMeta('text/markdown', 4, 'notes.md').fileName).toBe('notes.md')
  })

  it('refuses anything executable and a size that is not one', () => {
    expect(() => validateAttachmentMeta('application/x-msdownload', 10, 'virus.exe')).toThrow(/Files must be one of/i)
    expect(() => validateAttachmentMeta('application/pdf', 0, 'empty.pdf')).toThrow(/between 1 byte/i)
    expect(() => validateAttachmentMeta('application/pdf', DOCUMENT_ATTACHMENT_MAX_BYTES + 1, 'huge.pdf')).toThrow(/between 1 byte/i)
  })

  it('keeps only the last path segment of the name', () => {
    expect(validateAttachmentMeta('text/plain', 5, 'C:\\Users\\Officer\\minutes.txt').fileName).toBe('minutes.txt')
    expect(validateAttachmentMeta('text/plain', 5, '../../etc/passwd').fileName).toBe('passwd')
    expect(validateAttachmentMeta('text/plain', 5, '').fileName).toBe('attachment')
  })
})

describe('decodeTextAttachment', () => {
  it('decodes text files, BOM and all', () => {
    const bytes = new Uint8Array(Buffer.from('\uFEFFMinutes of the session', 'utf8'))
    expect(decodeTextAttachment(bytes, 'text/plain')).toBe('Minutes of the session')
  })

  it('leaves a PDF to the extractor', () => {
    expect(decodeTextAttachment(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'application/pdf')).toBeNull()
  })

  it('keeps an accented name intact through the byte round trip', () => {
    const bytes = new Uint8Array(Buffer.from('Treasurer: Rena Grace Aquiño', 'utf8'))
    expect(decodeTextAttachment(bytes, 'text/plain')).toContain('Aquiño')
  })
})

describe('documentSearchText', () => {
  it('covers the title, the text, the tags and the files', () => {
    const corpus = documentSearchText({
      title: 'Resolution on coastal cleanup',
      body: 'Adopted this 12th day of March.',
      tags: ['environment'],
      attachmentTexts: ['The ordinance number 2026-014 was read.']
    })
    expect(corpus).toContain('coastal cleanup')
    expect(corpus).toContain('environment')
    expect(corpus).toContain('ordinance number 2026-014')
  })

  it('ignores missing file text and bounds the total', () => {
    const corpus = documentSearchText({
      title: 't',
      body: 'b',
      tags: [],
      attachmentTexts: [null, undefined, 'x'.repeat(MAX_SEARCH_TEXT)]
    })
    expect(corpus.length).toBeLessThanOrEqual(MAX_SEARCH_TEXT)
  })

  it('carries a plain-spelling copy so an unaccented search finds an accented word', () => {
    const corpus = documentSearchText({
      title: 'Reunión with the officers of Dingle',
      body: 'Present: Rena Grace Aquiño.',
      tags: []
    })
    expect(corpus).toContain('Aquiño')
    expect(corpus).toContain('Aquino')
    expect(corpus).toContain('Reunion')
  })
})

describe('buildSearchQuery', () => {
  it('asks for every word as a prefix, which is what finds a phrase', () => {
    expect(buildSearchQuery('coastal cleanup')).toBe('coastal:* & cleanup:*')
  })

  it('drops noise and terms too short to mean anything', () => {
    expect(buildSearchQuery('a the   budget!!')).toBe('the:* & budget:*')
    expect(buildSearchQuery('?!...')).toBeNull()
    expect(buildSearchQuery('')).toBeNull()
  })

  it('never lets tsquery operators through', () => {
    expect(buildSearchQuery('minutes & ! (resolut | x) <-> \'secret\'')).toBe('minutes:* & resolut:* & secret:*')
  })

  it('asks for both spellings of an accented word', () => {
    expect(buildSearchQuery('Aquiño')).toBe('(aquiño:* | aquino:*)')
    expect(buildSearchQuery('Danugrao')).toBe('danugrao:*')
  })

  it('bounds how many words one search may carry', () => {
    const query = buildSearchQuery('one two three four five six seven eight nine ten')
    expect(query?.split(' & ')).toHaveLength(8)
  })
})

describe('hasContentChange', () => {
  const current = { title: 'Minutes', body: 'Called to order.', tags: ['session'], visibility: 'officers' as const }

  it('calls an identical submission no change', () => {
    expect(hasContentChange(current, { ...current }, null)).toBe(false)
  })

  it('ignores whitespace and tag order, which are the same document', () => {
    expect(hasContentChange(
      { ...current, tags: ['session', 'a'] },
      { title: ' Minutes ', body: 'Called to order.\r\n', tags: ['a', 'session'], visibility: 'officers' },
      null
    )).toBe(false)
  })

  it('sees a real edit', () => {
    expect(hasContentChange(current, { ...current, body: 'Called to order at 9.' }, null)).toBe(true)
    expect(hasContentChange(current, { ...current, visibility: 'public' }, null)).toBe(true)
  })

  it('lets a re-issue through when the author explains it', () => {
    expect(hasContentChange(current, { ...current }, 'Re-issued with corrected signatories')).toBe(true)
  })
})

describe('visibility', () => {
  it('publishes only what says it is public', () => {
    expect(documentIsPubliclyReadable({ visibility: 'public' })).toBe(true)
    expect(documentIsPubliclyReadable({ visibility: 'public', archived: true })).toBe(false)
    expect(documentIsPubliclyReadable({ visibility: 'officers' })).toBe(false)
  })

  it('builds a browse filter that hides archived filings by default', () => {
    expect(documentListWhere({ scope: 'officers', archived: 'active' }))
      .toEqual({ classification: 'officers', archived: false })
    expect(documentListWhere({ scope: 'all', archived: 'all' })).toEqual({})
    expect(documentListWhere({ scope: 'public', archived: 'archived', tag: 'budget', year: 2026 }))
      .toEqual({ classification: 'public', archived: true, tags: { has: 'budget' }, year: 2026 })
    expect(documentListWhere({ scope: 'restricted', archived: 'active' }))
      .toEqual({ classification: 'restricted', archived: false })
  })

  it('reads the scope and archive flags a URL may carry', () => {
    expect(parseDocumentScope('public')).toBe('public')
    expect(parseDocumentScope('restricted')).toBe('restricted')
    expect(parseDocumentScope('students')).toBe('all')
    expect(parseArchivedFilter('true')).toBe('archived')
    expect(parseArchivedFilter('all')).toBe('all')
    expect(parseArchivedFilter('')).toBe('active')
  })
})

describe('documentSummary', () => {
  it('flattens the text and cuts it with an ellipsis', () => {
    expect(documentSummary('Called  to\norder.')).toBe('Called to order.')
    const summary = documentSummary('x'.repeat(400), 180)
    expect(summary).toHaveLength(180)
    expect(summary.endsWith('…')).toBe(true)
    expect(documentSummary('Short.', 180)).toBe('Short.')
  })
})
