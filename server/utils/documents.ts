import type { Prisma } from '@prisma/client'
import { badRequest } from './http'

/**
 * Documents & resolutions archive (plan §8.8). Everything decidable without a
 * database lives here: the filing number, which edits count as a new version,
 * the search corpus, the full-text query and the visibility rules. The routes
 * stay thin and this file is what the unit tests pin down.
 */

export const DOCUMENT_VISIBILITIES = ['public', 'officers'] as const
export type DocumentVisibility = typeof DOCUMENT_VISIBILITIES[number]

/**
 * The types the migration seeds. The table is the source of truth (the council
 * can add a type or re-word a prefix); this list documents the five from the
 * plan and is what the tests number against.
 */
export const DEFAULT_DOCUMENT_TYPES = [
  { key: 'minutes', name: 'Minutes', prefix: 'Minutes No.' },
  { key: 'resolution', name: 'Resolution', prefix: 'Resolution No.' },
  { key: 'memo', name: 'Memorandum', prefix: 'Memo No.' },
  { key: 'constitution', name: 'Constitution and By-Laws', prefix: 'Constitution No.' },
  { key: 'report', name: 'Report', prefix: 'Report No.' }
] as const

export const DEFAULT_PAD = 3
export const MAX_PAD = 6
export const MAX_PREFIX_LENGTH = 40
export const MAX_TITLE_LENGTH = 200
export const MAX_BODY_CHARS = 60_000
export const MAX_CHANGE_NOTE = 500
export const MAX_FINANCE_REF = 120
export const MAX_TAGS = 12
export const MAX_TAG_LENGTH = 32
export const MAX_SEARCH_TERMS = 8

/**
 * Attachment rules. Bigger than an excuse's 5 MB because these are the
 * council's actual papers (scanned minutes, the constitution). Everything here
 * has a text path or is a scan we can only index by title.
 */
export const DOCUMENT_ATTACHMENT_MIMES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg'
] as const
export const DOCUMENT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024

/**
 * How much text one document may contribute to the corpus. A tsvector is capped
 * at 1 MB by PostgreSQL (`to_tsvector` errors past it), so the corpus has to
 * stay comfortably below: a bounded body, the files' extracted text, and the
 * whole thing trimmed to MAX_PRIMARY_TEXT — half of MAX_SEARCH_TEXT because the
 * corpus is indexed together with its plain-spelling copy.
 */
export const MAX_ATTACHMENT_TEXT = 20_000
export const MAX_PRIMARY_TEXT = 75_000
export const MAX_SEARCH_TEXT = 150_000
/** Files whose text is read back when the corpus is rebuilt (a read bound, not a search bound). */
export const MAX_CORPUS_ATTACHMENTS = 50

/** "Resolution No." + 2026 + 14 → "Resolution No. 2026-014". */
export function formatDocumentNumber(
  type: { prefix: string, pad: number },
  year: number,
  sequence: number
): string {
  if (!Number.isInteger(year) || year < 1900 || year > 3000) throw badRequest('The filing year looks wrong')
  if (!Number.isInteger(sequence) || sequence < 1) throw badRequest('The filing sequence looks wrong')
  const pad = Math.min(Math.max(Math.trunc(type.pad) || DEFAULT_PAD, 1), MAX_PAD)
  return `${type.prefix.trim()} ${year}-${String(sequence).padStart(pad, '0')}`
}

/** Years can be filed explicitly (a December meeting minuted in January). */
export function parseYear(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback
  const year = Number.parseInt(String(value), 10)
  if (!Number.isInteger(year) || year < 1900 || year > 3000) {
    throw badRequest('year must be a four-digit year')
  }
  return year
}

export function nextVersion(current: number): number {
  return (Number.isInteger(current) && current > 0 ? current : 1) + 1
}

/** Tags are lowercase, trimmed, de-duplicated and bounded — a stable filter key. */
export function normalizeTags(input: unknown): string[] {
  if (input === undefined || input === null || input === '') return []
  const raw = Array.isArray(input) ? input : String(input).split(',')
  const seen = new Set<string>()
  for (const entry of raw) {
    const tag = String(entry ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
    if (!tag) continue
    seen.add(tag)
    if (seen.size >= MAX_TAGS) break
  }
  return [...seen]
}

export interface DocumentContentInput {
  title: string
  body: string
  tags: string[]
  visibility: DocumentVisibility
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * The content half of a document/version: what a new version captures and what
 * the immutable history keeps. `fallback` lets a new version inherit the fields
 * the caller did not send (the form sends them all; the API stays forgiving).
 */
export function validateDocumentContent(
  body: Record<string, unknown>,
  fallback?: { title?: string, body?: string, tags?: string[], visibility?: string }
): DocumentContentInput {
  const title = (body.title === undefined ? str(fallback?.title) : str(body.title)).trim()
  if (title.length < 3 || title.length > MAX_TITLE_LENGTH) {
    throw badRequest(`A title is needed (3–${MAX_TITLE_LENGTH} characters)`)
  }

  const text = body.body === undefined ? str(fallback?.body) : str(body.body)
  if (text.length > MAX_BODY_CHARS) {
    throw badRequest(`The text is too long (${MAX_BODY_CHARS} characters maximum)`)
  }

  const tags = body.tags === undefined ? (fallback?.tags ?? []) : normalizeTags(body.tags)

  const requested = body.visibility === undefined ? str(fallback?.visibility) : str(body.visibility)
  const visibility = requested || 'officers'
  if (!(DOCUMENT_VISIBILITIES as readonly string[]).includes(visibility)) {
    throw badRequest(`visibility must be one of ${DOCUMENT_VISIBILITIES.join(', ')}`)
  }

  return { title, body: text, tags, visibility: visibility as DocumentVisibility }
}

/** The change note that goes with a new version ("typo in §3", "names corrected"). */
export function validateChangeNote(value: unknown): string | null {
  const note = str(value).trim()
  if (!note) return null
  if (note.length > MAX_CHANGE_NOTE) throw badRequest(`The change note is too long (${MAX_CHANGE_NOTE} characters maximum)`)
  return note
}

export function validateFinanceRef(value: unknown): string | null {
  const ref = str(value).trim()
  if (!ref) return null
  if (ref.length > MAX_FINANCE_REF) throw badRequest(`The finance reference is too long (${MAX_FINANCE_REF} characters maximum)`)
  return ref
}

/** A filing type's editable fields. */
export function validateDocumentType(body: Record<string, unknown>): { name: string, prefix: string, pad: number } {
  const name = str(body.name).trim()
  if (name.length < 2 || name.length > 60) throw badRequest('A type needs a name (2–60 characters)')

  const prefix = str(body.prefix).trim()
  if (prefix.length < 2 || prefix.length > MAX_PREFIX_LENGTH) {
    throw badRequest(`A type needs a prefix (2–${MAX_PREFIX_LENGTH} characters), e.g. "Resolution No."`)
  }

  const pad = body.pad === undefined ? DEFAULT_PAD : Number(body.pad)
  if (!Number.isInteger(pad) || pad < 1 || pad > MAX_PAD) {
    throw badRequest(`pad must be a whole number between 1 and ${MAX_PAD}`)
  }

  return { name, prefix, pad }
}

/** A new filing type, keyed for the URL and the sequence table. */
export function validateNewDocumentType(body: Record<string, unknown>): { key: string, name: string, prefix: string, pad: number } {
  const key = str(body.key).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (key.length < 2 || key.length > 40) throw badRequest('A type needs a key (2–40 letters, digits or dashes)')
  if (DEFAULT_DOCUMENT_TYPES.some(t => t.key === key)) throw badRequest(`The type "${key}" already exists`)
  return { key, ...validateDocumentType(body) }
}

/** An attachment's metadata (bytes go to object storage, never the database). */
export function validateAttachmentMeta(
  mime: unknown,
  size: unknown,
  fileName: unknown
): { mime: string, size: number, fileName: string } {
  if (typeof mime !== 'string' || !(DOCUMENT_ATTACHMENT_MIMES as readonly string[]).includes(mime)) {
    throw badRequest(`Files must be one of ${DOCUMENT_ATTACHMENT_MIMES.join(', ')}`)
  }
  const bytes = Number(size)
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > DOCUMENT_ATTACHMENT_MAX_BYTES) {
    throw badRequest(`Files must be between 1 byte and ${Math.round(DOCUMENT_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB`)
  }
  // Display name only — the storage key is generated from a uuid — but keep it
  // free of path separators so nothing downstream can misread it as a path.
  const name = str(fileName).split(/[\\/]/).pop()?.trim().slice(0, 200) ?? ''
  return { mime, size: bytes, fileName: name || 'attachment' }
}

/** Plain text (and its cousins) needs no dependency at all: they are text. */
export function decodeTextAttachment(bytes: Uint8Array, mime: string): string | null {
  if (!/^text\//.test(mime)) return null
  const text = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '')
  return text.replaceAll('\u0000', '').slice(0, MAX_ATTACHMENT_TEXT)
}

/**
 * Text of an uploaded file, extracted once at upload time so search never has
 * to open the file again. PDFs go through `unpdf` (a maintained build of the
 * pdf.js engine for servers, see the commit message); text files are decoded
 * directly; images are scans and contribute nothing. Extraction never takes the
 * upload down with it — a file we cannot read is still filed and listed, it just
 * does not add words to the index.
 */
export async function extractAttachmentText(bytes: Uint8Array, mime: string): Promise<string> {
  const plain = decodeTextAttachment(bytes, mime)
  if (plain !== null) return plain
  if (mime !== 'application/pdf') return ''

  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    return String(text ?? '').replaceAll('\u0000', '').slice(0, MAX_ATTACHMENT_TEXT)
  } catch (err) {
    console.error('[documents] PDF text extraction failed:', err instanceof Error ? err.message : err)
    return ''
  }
}

/**
 * A `to_tsquery` expression for the user's words, or null when there is nothing
 * searchable to ask for (the caller then falls back to a substring match).
 *
 * Every term must appear (AND) and every term is a prefix match, so typing the
 * first half of a word works. The 'simple' configuration keeps Filipino names
 * intact, and a term with accents asks for both spellings — the corpus carries
 * both, see `documentSearchText`. Only letters and digits survive, which is
 * also what makes the result safe to hand to `to_tsquery`.
 */

/** Strip accents, for the plain copy of the corpus ("Aquiño" → "Aquino"). */
function deaccent(term: string): string {
  return term.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * The search corpus: everything a reader would expect to find this document by,
 * including the words inside its uploaded files. The tsvector column is
 * generated from this string by the database, so this is the only thing writers
 * have to keep correct.
 *
 * The corpus is indexed twice: as written, and with its accents stripped. That
 * is what makes search tolerant of how Filipino names are typed — a filing that
 * says "Aquiño" is found by "Aquino" and vice versa. PostgreSQL's `unaccent`
 * cannot be used in a generated column (it is not immutable), so the plain copy
 * is made here, where it can be tested.
 */
export function documentSearchText(input: {
  title: string
  body: string
  tags: string[]
  attachmentTexts?: Array<string | null | undefined>
}): string {
  const parts = [input.title, input.body, ...input.tags]
  for (const text of input.attachmentTexts ?? []) {
    if (text) parts.push(text)
  }
  const corpus = parts.join('\n').slice(0, MAX_PRIMARY_TEXT)
  const plain = deaccent(corpus)
  if (plain === corpus) return corpus
  return `${corpus}\n${plain}`.slice(0, MAX_SEARCH_TEXT)
}

/**
 * A `to_tsquery` expression for the user's words, or null when there is nothing
 * searchable to ask for (the caller then falls back to a substring match).
 *
 * Every term must appear (AND) and every term is a prefix match, so typing the
 * first half of a word works. The 'simple' configuration keeps Filipino names
 * intact, and a term with accents asks for both spellings — the corpus carries
 * both, see `documentSearchText`. Only letters and digits survive, which is
 * also what makes the result safe to hand to `to_tsquery`.
 */
export function buildSearchQuery(q: string): string | null {
  const terms = String(q ?? '')
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(term => term.length >= 2)
    .slice(0, MAX_SEARCH_TERMS)

  if (terms.length === 0) return null

  return terms
    .map((term) => {
      const plain = deaccent(term)
      const variants = plain && plain !== term ? [term, plain] : [term]
      const expr = variants.map(variant => `${variant}:*`).join(' | ')
      return variants.length > 1 ? `(${expr})` : expr
    })
    .join(' & ')
}

/** A document's content, as the change test sees it. */
function contentFingerprint(input: DocumentContentInput): string {
  return JSON.stringify({
    title: input.title.trim(),
    body: input.body.replace(/\r\n/g, '\n').trim(),
    tags: [...input.tags].sort(),
    visibility: input.visibility
  })
}

/**
 * Whether a new version would actually be a new version. Re-publishing the same
 * wording is refused unless the author explains it in a change note (a
 * re-issue, a correction of the record) — an archive full of identical versions
 * is an archive nobody can read.
 */
export function hasContentChange(current: DocumentContentInput, next: DocumentContentInput, changeNote: string | null): boolean {
  if (changeNote) return true
  return contentFingerprint(current) !== contentFingerprint(next)
}

/** A public document anyone may read: it says so, and it is not archived. */
export function documentIsPubliclyReadable(doc: { visibility: string, archived?: boolean }): boolean {
  return doc.visibility === 'public' && doc.archived !== true
}

/** Search is offered at the three places a reader looks: everything, public, officers. */
export const DOCUMENT_SCOPES = ['all', 'public', 'officers'] as const
export type DocumentScope = typeof DOCUMENT_SCOPES[number]

export const ARCHIVE_FILTERS = ['active', 'archived', 'all'] as const
export type ArchiveFilter = typeof ARCHIVE_FILTERS[number]

export function parseDocumentScope(value: unknown): DocumentScope {
  const scope = str(value)
  return scope === 'public' || scope === 'officers' ? scope : 'all'
}

/** `?archived=`: the default view hides archived filings. */
export function parseArchivedFilter(value: unknown): ArchiveFilter {
  const flag = str(value)
  if (flag === 'true' || flag === 'archived') return 'archived'
  if (flag === 'all') return 'all'
  return 'active'
}

/** Everything a browse (not a search) can filter on. */
export interface DocumentListFilters {
  scope: DocumentScope
  archived: ArchiveFilter
  typeId?: string | null
  tag?: string | null
  year?: number | null
  eventId?: string | null
}

/**
 * The Prisma `where` for a browse. Pure so the route and the tests agree on
 * exactly who sees what — in particular that a public browse can never return
 * an officers-only filing, archived or not.
 */
export function documentListWhere(filters: DocumentListFilters): Prisma.DocumentWhereInput {
  const where: Prisma.DocumentWhereInput = {}
  if (filters.scope === 'public') where.visibility = 'public'
  if (filters.scope === 'officers') where.visibility = 'officers'
  if (filters.archived === 'active') where.archived = false
  if (filters.archived === 'archived') where.archived = true
  if (filters.typeId) where.typeId = filters.typeId
  if (filters.tag) where.tags = { has: filters.tag }
  if (filters.year) where.year = filters.year
  if (filters.eventId) where.eventId = filters.eventId
  return where
}

/** A one-line taste of the text for a list row. */
export function documentSummary(body: string, length = 180): string {
  const flat = str(body).replace(/\s+/g, ' ').trim()
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat
}
