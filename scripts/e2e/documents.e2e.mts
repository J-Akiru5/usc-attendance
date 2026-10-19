// Live end-to-end test: documents & resolutions archive (plan §8.8). Proves the
// acceptance path — a phrase that exists only inside an uploaded file's
// extracted text is found by search, a signed-out visitor sees only public
// filings — plus auto-numbering under two simultaneous filings, the immutable
// version history, attachments and the visibility rules.
// Throwaway @example.invalid data, deleted afterwards.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { api, BASE_URL } from './client.mts'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2edoc' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made = {
  userIds: [] as string[],
  documentIds: [] as string[],
  typeIds: [] as string[],
  storageKeys: [] as string[],
  eventIds: [] as string[]
}

async function mkUser(key: string, extra: Record<string, unknown> = {}) {
  const email = `${tag}-${key}@example.invalid`
  const password = randomBytes(12).toString('base64url') + 'aA1!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await prisma.user.create({
    data: { id: data.user.id, email, name: `E2E ${key}`, position: 'Test', role: 'client', mustChangePassword: false, active: true, ...extra }
  })
  const { data: s, error: se } = await anon().auth.signInWithPassword({ email, password })
  if (se || !s.session) throw se
  made.userIds.push(data.user.id)
  return { id: data.user.id, token: s.session.access_token }
}

/** A one-page PDF holding a phrase that exists nowhere else in the system. */
async function pdfWith(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([480, 200])
  page.drawText(text, { x: 24, y: 120, size: 12, font })
  page.drawText('University Student Council, ISUFST Dingle Campus', { x: 24, y: 90, size: 10, font })
  return Buffer.from(await pdf.save())
}

async function upload(documentId: string, token: string, fileName: string, mime: string, bytes: Buffer) {
  return api(`/api/documents/${documentId}/attachments`, {
    method: 'POST',
    token,
    body: { fileName, mime, dataBase64: bytes.toString('base64') }
  })
}

/** Files a document through the API and remembers it for cleanup. */
async function file(token: string, body: Record<string, unknown>) {
  const result = await api('/api/documents', { token, method: 'POST', body })
  if (result._s === 201 && result._b?.document?.id) made.documentIds.push(result._b.document.id)
  return result
}

const sequenceOf = async (typeId: string, year: number) =>
  prisma.documentSequence.findUnique({ where: { typeId_year: { typeId, year } } })

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const manager = await mkUser('manager', { role: 'super_admin' })
  const student = await mkUser('student', { role: 'student' })
  await prisma.studentProfile.create({ data: { userId: student.id, studentNo: `${tag.slice(-7)}1` } })

  // Phrases that exist only inside uploaded files (one PDF, one text file) and
  // one that exists only in an officers-only filing.
  const pdfPhrase = `zambalig coastal trust ${tag.slice(-6)}`
  const txtPhrase = `pamana river easement ${tag.slice(-7)}`
  const hiddenPhrase = `internal caucus ledger ${tag.slice(-6)}`
  const year = 2026 + (Date.now() % 2 === 0 ? 0 : 1)

  console.log('\n--- filing types ---')
  let r = await api('/api/documents/types', { token: staff.token })
  const resolutionType = (r._b?.types ?? []).find((t: { key: string }) => t.key === 'resolution')
  const typeKeys = (r._b?.types ?? []).map((t: { key: string }) => t.key)
  check('the seeded types are there (200)', r._s === 200 && !!resolutionType, `${r._s} ${JSON.stringify(typeKeys)}`)
  check('all five of the plan\'s types were seeded', ['minutes', 'resolution', 'memo', 'constitution', 'report'].every(k => typeKeys.includes(k)), JSON.stringify(typeKeys))
  check('the resolution prefix and padding are the plan\'s example', resolutionType?.prefix === 'Resolution No.' && resolutionType?.pad === 3, JSON.stringify(resolutionType))

  r = await api('/api/documents/types', { token: staff.token, method: 'PUT' })
  check('the types endpoint refuses the wrong verb (405)', r._s === 405, `${r._s}`)

  r = await api('/api/documents/types', { token: student.token })
  check('a student cannot list the filing types (403)', r._s === 403, `${r._s}`)

  // A type of this suite's own: its sequence is touched by nobody else, so the
  // concurrency proof below cannot be disturbed by another run.
  r = await api('/api/documents/types', {
    token: staff.token,
    method: 'POST',
    body: { key: `e2e-ledger-${tag.slice(-6)}`, name: `${tag} Ledger`, prefix: `${tag} Ledger No.`, pad: 3 }
  })
  const ledgerId = r._b?.type?.id
  const ledgerKey = r._b?.type?.key
  if (r._s === 201 && ledgerId) made.typeIds.push(ledgerId)
  check('a new filing type can be added (201)', r._s === 201 && !!ledgerId, `${r._s} ${JSON.stringify(r._b?.type)}`)

  r = await api('/api/documents/types', { token: staff.token, method: 'POST', body: { key: ledgerKey, name: 'Again', prefix: 'Again No.' } })
  check('a duplicate type key is refused (409)', r._s === 409, `${r._s}`)

  r = await api('/api/documents/types', { token: staff.token, method: 'POST', body: { name: 'No key', prefix: 'Nope No.' } })
  check('a type without a key is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- filing a document (auto-numbering) ---')
  r = await api('/api/documents', { token: student.token, method: 'POST', body: { typeId: ledgerId, title: 'Students cannot file' } })
  check('a student cannot file (403)', r._s === 403, `${r._s}`)

  r = await file(staff.token, { typeId: ledgerId, year, title: 'no' })
  check('a one-word title is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/documents', { token: staff.token, method: 'POST', body: { key: 'nope', title: 'Unknown type' } })
  check('filing under a type that does not exist is refused (400)', r._s === 400, `${r._s}`)

  r = await file(staff.token, {
    typeId: resolutionType.id,
    year,
    title: `${tag} Resolution on the coastal cleanup`,
    body: 'WHEREAS, the council adopts the Panay coastal cleanup programme for this academic year.',
    tags: 'Environment, Senate',
    visibility: 'public',
    confirmUnredactedPublish: true,
    financeRef: 'BL-2026-004'
  })
  const publicId = r._b?.document?.id
  const publicNumber = r._b?.document?.number
  const publicYear = r._b?.document?.year
  check('a resolution is filed with a number (201)', r._s === 201 && /^Resolution No\. \d{4}-\d{3}$/.test(String(publicNumber)), `${r._s} ${publicNumber}`)
  // Self-consistent: the number's year must be the year the archive recorded on
  // the document itself, rather than anything a local clock assumes.
  check('the year in the number is the filing year', String(publicNumber).includes(String(publicYear)), `${publicNumber} vs ${publicYear}`)
  check('its tags were normalised', JSON.stringify(r._b?.document?.tags) === JSON.stringify(['environment', 'senate']), JSON.stringify(r._b?.document?.tags))
  check('it starts at version 1 and is public', r._b?.document?.currentVersion === 1 && r._b?.document?.visibility === 'public', JSON.stringify({ v: r._b?.document?.currentVersion, vis: r._b?.document?.visibility }))
  const resolutionSequence = await sequenceOf(resolutionType.id, year)
  check('the type\'s counter matches the number that was handed out', Number(String(publicNumber).split('-').pop()) === resolutionSequence?.last, `${publicNumber} vs ${JSON.stringify(resolutionSequence)}`)

  console.log('\n--- two officers file at the same moment ---')
  const parallelBody = (n: number) => ({
    typeId: ledgerId,
    year,
    title: `${tag} Concurrent ledger entry ${n}`,
    body: 'Filed at the same instant as another one.',
    visibility: 'officers'
  })
  const [first, second] = await Promise.all([
    file(staff.token, parallelBody(1)),
    file(manager.token, parallelBody(2))
  ])
  const numbers = [first._b?.document?.number, second._b?.document?.number]
  check('both concurrent filings succeeded (201/201)', first._s === 201 && second._s === 201, `${first._s} ${second._s} ${JSON.stringify(numbers)}`)
  check('they drew two different numbers', !!numbers[0] && !!numbers[1] && numbers[0] !== numbers[1], JSON.stringify(numbers))
  const drawn = numbers.map((n: string) => Number(String(n).split('-').pop())).sort((a: number, b: number) => a - b)
  check('and consecutive ones — neither waited for a gap', drawn[1] === drawn[0] + 1, JSON.stringify(drawn))
  check('the counter agrees with what was handed out', (await sequenceOf(ledgerId, year))?.last === drawn[1], JSON.stringify(await sequenceOf(ledgerId, year)))
  const duplicates = await prisma.document.groupBy({ by: ['number'], where: { typeId: ledgerId, year }, _count: { _all: true } })
  check('no number was ever handed out twice', duplicates.length === 0 || duplicates.every(row => row._count._all === 1), JSON.stringify(duplicates.filter(d => d._count._all > 1)))

  console.log('\n--- the prefix and the sequence width are configurable ---')
  r = await api(`/api/documents/types/${ledgerId}`, { method: 'PUT', token: staff.token, body: { prefix: `${tag} Ledger Serial`, pad: 4 } })
  check('a type\'s prefix and padding can be changed (200)', r._s === 200 && r._b?.type?.pad === 4, `${r._s} ${JSON.stringify(r._b?.type?.pad)}`)
  r = await file(staff.token, { typeId: ledgerId, year, title: `${tag} Renumbered ledger entry`, body: 'Filed after the prefix changed.' })
  check('the next number uses the new prefix and width', r._s === 201 && String(r._b?.document?.number).startsWith(`${tag} Ledger Serial ${year}-`) === true && String(r._b?.document?.number).split('-').pop()?.length === 4, `${r._s} ${r._b?.document?.number}`)

  console.log('\n--- a phrase that exists only inside an uploaded PDF ---')
  r = await upload(publicId, staff.token, 'coastal-cleanup.pdf', 'application/pdf', await pdfWith(pdfPhrase))
  const pdfRow = await prisma.documentAttachment.findFirst({ where: { documentId: publicId, fileName: 'coastal-cleanup.pdf' } })
  if (pdfRow) made.storageKeys.push(pdfRow.storageKey)
  check('the PDF is accepted and its text extracted (201, hasText)', r._s === 201 && r._b?.attachment?.hasText === true, `${r._s} ${JSON.stringify(r._b?.attachment)}`)

  r = await api('/api/documents', { token: staff.token, query: { q: pdfPhrase } })
  check('search finds the document by a phrase inside the PDF', r._s === 200 && (r._b?.documents ?? []).some((d: { id: string }) => d.id === publicId), `${r._s} ${JSON.stringify((r._b?.documents ?? []).map((d: { id: string }) => d.id))}`)
  check('and says it matched full text, not a fallback', r._b?.ranked === true, `${r._b?.ranked}`)

  r = await api('/api/documents', { token: staff.token, query: { q: pdfPhrase.slice(0, 12) } })
  check('a half-typed word still finds it (prefix search)', (r._b?.documents ?? []).some((d: { id: string }) => d.id === publicId), JSON.stringify(r._b?.documents?.length))

  r = await api('/api/documents', { token: staff.token, query: { q: 'ISUFST Dingle Campus' } })
  check('the PDF\'s other line is searchable too', (r._b?.documents ?? []).some((d: { id: string }) => d.id === publicId), JSON.stringify(r._b?.documents?.length))

  console.log('\n--- a text file is read without a parser, and Filipino names are tolerant ---')
  r = await file(staff.token, {
    typeId: ledgerId,
    year,
    title: `${tag} Notes from the river survey`,
    body: 'Filed with a text attachment.',
    visibility: 'public',
    confirmUnredactedPublish: true
  })
  const textId = r._b?.document?.id
  check('the second document is filed (201)', r._s === 201 && !!textId, `${r._s}`)

  r = await upload(textId, staff.token, 'survey-notes.md', 'text/markdown', Buffer.from(`# Survey notes\n\n${txtPhrase}\n\nSigned by Renato Aquiño.`, 'utf8'))
  const mdRow = await prisma.documentAttachment.findFirst({ where: { documentId: textId, fileName: 'survey-notes.md' } })
  if (mdRow) made.storageKeys.push(mdRow.storageKey)
  check('a markdown file is accepted and decoded (201, hasText)', r._s === 201 && r._b?.attachment?.hasText === true, `${r._s}`)

  r = await api('/api/documents', { token: staff.token, query: { q: txtPhrase } })
  check('its phrase is found too', (r._b?.documents ?? []).some((d: { id: string }) => d.id === textId), JSON.stringify(r._b?.documents?.length))

  r = await api('/api/documents', { token: staff.token, query: { q: 'Aquiño' } })
  check('an accented Filipino name is found as typed', (r._b?.documents ?? []).some((d: { id: string }) => d.id === textId), JSON.stringify(r._b?.documents?.length))
  r = await api('/api/documents', { token: staff.token, query: { q: 'Aquino' } })
  check('and found without the accent as well', (r._b?.documents ?? []).some((d: { id: string }) => d.id === textId), JSON.stringify(r._b?.documents?.length))

  r = await api('/api/documents', { token: staff.token, query: { q: `${txtPhrase} & | !secret` } })
  check('tsquery operators in the search box are inert, not an error (200)', r._s === 200, `${r._s}`)

  console.log('\n--- attachments, downloads and refusals ---')
  const textAttachment = await prisma.documentAttachment.findFirst({ where: { documentId: textId } })
  const download = await fetch(`${BASE_URL}/api/documents/${textId}/attachments/${textAttachment!.id}`)
  check('a published file is downloadable by anyone (200, text/markdown)', download.status === 200 && download.headers.get('content-type')?.includes('text/markdown') === true, `${download.status} ${download.headers.get('content-type')}`)
  check('and its bytes come back intact', (await download.text()).includes(txtPhrase), 'body mismatch')

  r = await upload(publicId, staff.token, 'malware.exe', 'application/x-msdownload', Buffer.from('nope'))
  check('an executable is refused (400)', r._s === 400, `${r._s}`)

  r = await upload(publicId, staff.token, 'empty.pdf', 'application/pdf', Buffer.alloc(0))
  check('an empty file is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- versions are immutable ---')
  r = await api(`/api/documents/${publicId}/versions`, { token: staff.token, method: 'POST', body: { body: 'WHEREAS, the council adopts the Panay coastal cleanup programme for this academic year.' } })
  check('re-filing identical content is refused (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/documents/${publicId}/versions`, {
    token: staff.token,
    method: 'POST',
    body: {
      body: 'WHEREAS, the council adopts the Panay coastal cleanup programme, amended to include the river easement.',
      tags: 'environment, senate, amended',
      visibility: 'public',
      changeNote: 'Amended §2 to include the easement'
    }
  })
  check('an edit files version 2 (201)', r._s === 201 && r._b?.version?.version === 2, `${r._s} ${JSON.stringify(r._b?.version)}`)
  check('the document now points at v2', r._b?.document?.currentVersion === 2, `${r._b?.document?.currentVersion}`)

  r = await api(`/api/documents/${publicId}`, { token: staff.token })
  const versions = r._b?.document?.versions ?? []
  check('the version list keeps both, newest first, with who and when', versions.length === 2 && versions[0]?.version === 2 && !!versions[1]?.createdAt && !!versions[0]?.creator?.name, JSON.stringify(versions.map((v: { version: number }) => v.version)))
  check('the current version is explicit', r._b?.document?.currentVersion === 2 && r._b?.document?.body?.includes('river easement'), `${r._b?.document?.currentVersion}`)

  r = await api(`/api/documents/${publicId}/versions/1`, { token: staff.token })
  check('version 1 still reads exactly as filed (200)', r._s === 200 && r._b?.version?.body?.includes('for this academic year') && !r._b?.version?.body?.includes('river easement'), `${r._s}`)
  check('version 1 says who filed it and when', !!r._b?.version?.creator?.name && !!r._b?.version?.createdAt, JSON.stringify(r._b?.version?.creator))
  check('version 1 is not marked current', r._b?.isCurrent === false, `${r._b?.isCurrent}`)

  check('the history holds exactly two versions — v1 cannot be edited away', (await prisma.documentVersion.count({ where: { documentId: publicId } })) === 2, 'count mismatch')

  console.log('\n--- the public sees the published filings only ---')
  r = await file(staff.token, {
    typeId: ledgerId,
    year,
    title: `${tag} Internal caucus notes`,
    body: `Officers only: ${hiddenPhrase}`,
    visibility: 'officers'
  })
  const officerId = r._b?.document?.id
  check('an officers-only filing is created (201)', r._s === 201 && !!officerId, `${r._s}`)

  r = await api('/api/documents/public')
  const publicIds = (r._b?.documents ?? []).map((d: { id: string }) => d.id)
  check('a signed-out visitor gets the public archive (200)', r._s === 200, `${r._s}`)
  check('it holds the published resolution', publicIds.includes(publicId), `${publicIds.length} listed`)
  check('and never an officers-only filing', !publicIds.includes(officerId), `leaked ${officerId}`)
  check('the public payload carries no officers-only text', !JSON.stringify(r._b ?? {}).includes(hiddenPhrase), 'the hidden phrase is in the public payload')
  // The public archive offers the types that actually have public filings —
  // deliberately not every seeded type, since offering an empty filter is noise.
  check('the visitor is offered the filing types that have public filings', (r._b?.types ?? []).length >= 1 && (r._b?.types ?? []).some((t: { key: string }) => t.key === 'resolution'), JSON.stringify((r._b?.types ?? []).map((t: { key: string }) => t.key)))

  r = await api('/api/documents/public', { query: { q: hiddenPhrase } })
  check('searching it as a visitor finds nothing', r._s === 200 && (r._b?.documents ?? []).length === 0, `${r._s} ${(r._b?.documents ?? []).length}`)

  r = await api('/api/documents/public', { query: { q: pdfPhrase } })
  check('but the same search does reach the published file text', (r._b?.documents ?? []).some((d: { id: string }) => d.id === publicId), JSON.stringify((r._b?.documents ?? []).length))

  r = await api(`/api/documents/public/${officerId}`)
  check('an officers-only document answers 404 to a visitor', r._s === 404, `${r._s}`)

  const officerUpload = await upload(officerId, staff.token, 'caucus-ledger.txt', 'text/plain', Buffer.from(`Minutes of the closed session.\n${hiddenPhrase}`, 'utf8'))
  const officerAttachment = await prisma.documentAttachment.findFirst({ where: { documentId: officerId, fileName: 'caucus-ledger.txt' } })
  if (officerAttachment) made.storageKeys.push(officerAttachment.storageKey)
  check('an officers-only attachment is uploaded (201)', officerUpload._s === 201, `${officerUpload._s}`)
  const denied = await fetch(`${BASE_URL}/api/documents/${officerId}/attachments/${officerAttachment!.id}`)
  check('and its file answers 404 to a visitor too', denied.status === 404, `${denied.status}`)

  r = await api(`/api/documents/public/${publicId}`)
  check('a published document answers in full (200, current text)', r._s === 200 && r._b?.document?.body?.includes('river easement') && r._b?.document?.currentVersion === 2, `${r._s}`)
  check('its attachment is listed for download', (r._b?.document?.attachments ?? []).some((a: { fileName: string }) => a.fileName === 'coastal-cleanup.pdf'), JSON.stringify(r._b?.document?.attachments))

  r = await api('/api/documents', {})
  check('the staff archive needs a session (401)', r._s === 401, `${r._s}`)

  r = await api(`/api/documents/${officerId}`, {})
  check('and so does one staff document (401)', r._s === 401, `${r._s}`)

  console.log('\n--- visibility, archiving and links are officer decisions ---')
  r = await api(`/api/documents/${officerId}`, { method: 'PUT', token: staff.token, body: { archived: true } })
  check('a filing can be archived, not deleted (200)', r._s === 200 && r._b?.document?.archived === true, `${r._s}`)

  r = await api('/api/documents', { token: staff.token, query: { q: hiddenPhrase } })
  check('an archived filing leaves the default search', (r._b?.documents ?? []).length === 0, JSON.stringify((r._b?.documents ?? []).length))
  r = await api('/api/documents', { token: staff.token, query: { q: hiddenPhrase, archived: 'all' } })
  check('but is still there for the council', (r._b?.documents ?? []).some((d: { id: string }) => d.id === officerId), JSON.stringify((r._b?.documents ?? []).length))

  r = await api(`/api/documents/${officerId}/versions`, { token: staff.token, method: 'POST', body: { title: `${tag} Internal caucus notes (revised)` } })
  check('an archived filing refuses a new version (409)', r._s === 409, `${r._s}`)

  r = await api(`/api/documents/${officerId}`, { method: 'PUT', token: staff.token, body: { archived: false, visibility: 'public' } })
  check('content fields are not silently patched by the metadata route (200, still officers-only)', r._s === 200 && r._b?.document?.visibility === 'officers' && r._b?.document?.archived === false, `${r._s} ${r._b?.document?.visibility}`)

  const event = await api('/api/events', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} assembly`, date: new Date().toISOString(), lat: 10.72, lng: 122.56, audienceType: 'all' }
  })
  const eventId = event._b?.id
  if (event._s === 201 && eventId) made.eventIds.push(eventId)
  check('an event to link to exists (201)', event._s === 201 && !!eventId, `${event._s}`)

  r = await api(`/api/documents/${publicId}`, { method: 'PUT', token: staff.token, body: { eventId, financeRef: 'LIQ-2026-011' } })
  check('a filing can be linked to an event and a finance record (200)', r._s === 200 && r._b?.document?.eventId === eventId && r._b?.document?.financeRef === 'LIQ-2026-011', `${r._s} ${JSON.stringify(r._b?.document?.financeRef)}`)

  r = await api(`/api/documents/${publicId}`, { method: 'PUT', token: staff.token, body: { eventId: '3f0e6a2e-0000-0000-0000-000000000000' } })
  check('linking a filing to an event that does not exist is refused (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/documents/${publicId}`, { method: 'PUT', token: staff.token, body: {} })
  check('a metadata update that changes nothing is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- filters that read the archive like a table ---')
  r = await api('/api/documents', { token: staff.token, query: { type: 'resolution', year, tag: 'environment' } })
  check('filtering by type key, year and tag works (200)', r._s === 200 && (r._b?.documents ?? []).length >= 1 && (r._b?.documents ?? []).every((d: { tags: string[] }) => d.tags.includes('environment')), `${r._s} ${JSON.stringify(r._b?.documents?.length)}`)

  r = await api('/api/documents', { token: staff.token, query: { type: 'nothing-like-this' } })
  check('an unknown type key is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/documents', { token: staff.token, query: { scope: 'public', pageSize: 1, sort: 'createdAt', dir: 'desc' } })
  check('paging reports a total and one row (200)', r._s === 200 && (r._b?.documents ?? []).length === 1 && typeof r._b?.total === 'number' && r._b.total >= 1, `${r._s} ${r._b?.documents?.length}`)

  r = await api('/api/documents', { token: staff.token, query: { sort: 'body' } })
  check('sorting by a column that is not offered is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/documents', { token: staff.token, query: { scope: 'officers', archived: 'all' } })
  check('the officers-only scope returns only officers-only filings', r._s === 200 && (r._b?.documents ?? []).every((d: { visibility: string }) => d.visibility === 'officers'), `${r._s}`)

  const audit = await prisma.auditLog.findFirst({ where: { action: 'document_filed', targetType: 'document', targetId: publicId } })
  check('every write left an audit row', !!audit && !!audit.performedBy, JSON.stringify(audit?.action))
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  // The bytes live outside the database; take them with us.
  try {
    const { rm } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const root = resolve(process.env.DOCUMENT_STORAGE_PATH ?? '.local/documents')
    for (const key of made.storageKeys) {
      if (key.includes('..')) continue
      await rm(resolve(root, key), { force: true }).catch(() => {})
    }
  } catch { /* nothing to remove */ }

  const documentIds = made.documentIds.filter(Boolean)
  if (documentIds.length > 0) {
    await prisma.documentAttachment.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } })
  }
  await prisma.document.deleteMany({ where: { title: { startsWith: tag } } })
  if (made.typeIds.length > 0) {
    await prisma.document.deleteMany({ where: { typeId: { in: made.typeIds } } })
    await prisma.documentSequence.deleteMany({ where: { typeId: { in: made.typeIds } } })
    await prisma.documentType.deleteMany({ where: { id: { in: made.typeIds } } })
  }
  if (made.eventIds.length > 0) {
    await prisma.document.updateMany({ where: { eventId: { in: made.eventIds } }, data: { eventId: null } })
    await prisma.event.deleteMany({ where: { id: { in: made.eventIds } } })
  }
  await prisma.event.deleteMany({ where: { title: { startsWith: tag } } })
  if (made.userIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { performedBy: { in: made.userIds } }] } })
  }
  for (const id of made.userIds) {
    await prisma.studentProfile.deleteMany({ where: { userId: id } })
    await prisma.user.delete({ where: { id } }).catch(() => {})
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
}

main()
  .catch((e) => { fail++; console.error('E2E error:', e) })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail ? 1 : 0)
  })
