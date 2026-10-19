// Live end-to-end test: document classification, redacted public copies and
// audited publishing (benchmark amendment BC-9, plan §8.8 and §11.2).
//
// The rule under test: nothing is public unless explicitly published, and no
// published artefact carries an unauthorised student name. The suite proves the
// acceptance path directly:
//   - a public document with a redacted copy serves the redacted text and never
//     the original phrase (and its original attachment is refused);
//   - a restricted document is absent from the public archive and its attachment
//     refuses access;
//   - publishing is audited, and publishing without a copy needs confirmation;
//   - the redaction note is part of the public record.
//
// Throwaway @example.invalid data, deleted afterwards.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { api, BASE_URL } from './client.mts'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2eredact' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made = {
  userIds: [] as string[],
  documentIds: [] as string[],
  typeIds: [] as string[],
  storageKeys: [] as string[]
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

async function file(token: string, body: Record<string, unknown>) {
  const result = await api('/api/documents', { token, method: 'POST', body })
  if (result._s === 201 && result._b?.document?.id) made.documentIds.push(result._b.document.id)
  return result
}

async function upload(documentId: string, token: string, fileName: string, mime: string, text: string) {
  const result = await api(`/api/documents/${documentId}/attachments`, {
    token,
    method: 'POST',
    body: { fileName, mime, dataBase64: Buffer.from(text, 'utf8').toString('base64') }
  })
  const row = await prisma.documentAttachment.findFirst({ where: { documentId, fileName } })
  if (row) made.storageKeys.push(row.storageKey)
  return { result, attachmentId: row?.id ?? null }
}

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const manager = await mkUser('manager', { role: 'super_admin' })
  const student = await mkUser('student', { role: 'student' })
  await prisma.studentProfile.create({ data: { userId: student.id, studentNo: `${tag.slice(-7)}1` } })

  // A token that must never appear in a public payload once redacted, and must
  // never appear at all for the restricted filing.
  const protectedName = `Zambalig${tag.slice(-6)}`
  const restrictedPhrase = `closed caucus ${tag.slice(-6)}`
  const year = 2026 + (Date.now() % 2 === 0 ? 0 : 1)

  console.log('\n--- a filing type of our own, so the sequence is untouched ---')
  let r = await api('/api/documents/types', { token: staff.token })
  const resolutionType = (r._b?.types ?? []).find((t: { key: string }) => t.key === 'resolution')
  check('the resolution type is available (200)', r._s === 200 && !!resolutionType, `${r._s}`)

  r = await api('/api/documents/types', {
    token: staff.token,
    method: 'POST',
    body: { key: `${tag}-minutes`, name: `${tag} Minutes`, prefix: `${tag} No.`, pad: 3 }
  })
  const typeId = r._b?.type?.id
  if (r._s === 201 && typeId) made.typeIds.push(typeId)
  check('a filing type for the suite is created (201)', r._s === 201 && !!typeId, `${r._s}`)

  console.log('\n--- a restricted document never reaches the public archive ---')
  r = await file(staff.token, {
    typeId,
    year,
    title: `${tag} Closed session minutes`,
    body: `Present: ${protectedName}. ${restrictedPhrase}`,
    classification: 'restricted'
  })
  const restrictedId = r._b?.document?.id
  check('a restricted document is filed (201)', r._s === 201 && !!restrictedId, `${r._s}`)
  check('it records its classification', r._b?.document?.classification === 'restricted', JSON.stringify(r._b?.document?.classification))
  check('the legacy visibility mirror is not public', r._b?.document?.visibility === 'officers', `${r._b?.document?.visibility}`)

  const restrictedFile = await upload(restrictedId, staff.token, 'closed-session.txt', 'text/plain', `${restrictedPhrase}\n${protectedName}`)
  check('its attachment is uploaded for officers (201)', restrictedFile.result._s === 201 && !!restrictedFile.attachmentId, `${restrictedFile.result._s}`)

  r = await api('/api/documents/public', { query: { typeId } })
  check('the public archive does not list it', r._s === 200 && !(r._b?.documents ?? []).some((d: { id: string }) => d.id === restrictedId), JSON.stringify((r._b?.documents ?? []).map((d: { id: string }) => d.id)))
  check('the public payload does not carry its text', !JSON.stringify(r._b ?? {}).includes(restrictedPhrase), 'the restricted phrase is in the public list payload')

  r = await api(`/api/documents/public/${restrictedId}`)
  check('a visitor gets 404 for it', r._s === 404, `${r._s}`)

  const deniedRestricted = await fetch(`${BASE_URL}/api/documents/${restrictedId}/attachments/${restrictedFile.attachmentId}`)
  check('and its attachment refuses public access', deniedRestricted.status === 404, `${deniedRestricted.status}`)

  r = await api(`/api/documents/${restrictedId}`, { token: staff.token })
  check('officers can still read it', r._s === 200 && r._b?.document?.body?.includes(restrictedPhrase), `${r._s}`)

  console.log('\n--- publishing without a redacted copy is confirmed and audited loudly ---')
  r = await file(staff.token, {
    typeId,
    year,
    title: `${tag} Resolution on the outreach programme`,
    body: `Present: ${protectedName}. Motion carried.`,
    classification: 'officers'
  })
  const publishedId = r._b?.document?.id
  check('an officers-only document is filed (201)', r._s === 201 && !!publishedId, `${r._s}`)

  const originalFile = await upload(publishedId, staff.token, 'original-notes.txt', 'text/plain', `Original file: ${protectedName}`)
  check('its original attachment is uploaded (201)', originalFile.result._s === 201 && !!originalFile.attachmentId, `${originalFile.result._s}`)

  r = await api(`/api/documents/${publishedId}`, { method: 'PUT', token: staff.token, body: { classification: 'public' } })
  check('publishing without confirmation is refused (400)', r._s === 400, `${r._s}`)
  check('the refusal mentions the missing redacted copy', String(r._b?.error ?? '').toLowerCase().includes('redacted copy'), String(r._b?.error))

  r = await api(`/api/documents/${publishedId}`, { method: 'PUT', token: staff.token, body: { classification: 'public', confirmUnredactedPublish: true } })
  check('the same publish is allowed once confirmed (200)', r._s === 200 && r._b?.document?.classification === 'public', `${r._s} ${r._b?.document?.classification}`)

  const loudAudit = await prisma.auditLog.findFirst({
    where: { action: 'document_published_unredacted', targetId: publishedId },
    orderBy: { createdAt: 'desc' }
  })
  const loudDetails = loudAudit ? JSON.parse(loudAudit.details ?? '{}') : {}
  check('the publish wrote a loud audit row', !!loudAudit, 'no document_published_unredacted row')
  check('the audit names the document, the actor and the missing copy', loudAudit?.targetId === publishedId
  && loudAudit?.performedBy === staff.id
  && loudDetails.redactedCopyInForce === false, JSON.stringify({ target: loudAudit?.targetId, actor: loudAudit?.performedBy, details: loudDetails }))
  check('and carries the warning a reviewer needs', String(loudDetails.warning ?? '').includes('no unauthorised student name'), JSON.stringify(loudDetails.warning))

  r = await api(`/api/documents/public/${publishedId}`)
  check('a published document with no copy serves its original text (200)', r._s === 200 && r._b?.document?.body?.includes(protectedName), `${r._s}`)
  check('and says no redaction is in force', r._b?.document?.isRedacted === false && r._b?.document?.redaction === null, JSON.stringify(r._b?.document?.redaction))

  r = await api('/api/documents/public', { query: { typeId, q: protectedName } })
  check('search finds the original while it is the published text', (r._b?.documents ?? []).some((d: { id: string }) => d.id === publishedId), JSON.stringify(r._b?.documents?.length))

  console.log('\n--- a redacted copy becomes the only public text ---')
  const redactionNote = 'Removed the name of one student; the motion and the officers named are part of the public record.'

  r = await api(`/api/documents/${publishedId}/redacted-copy`, {
    method: 'POST',
    token: student.token,
    body: { redactionNote, body: 'Present: [student name redacted]. Motion carried.' }
  })
  check('a student cannot prepare a redacted copy (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/documents/${publishedId}/redacted-copy`, {
    method: 'POST',
    token: staff.token,
    body: { body: 'Present: [student name redacted]. Motion carried.' }
  })
  check('the note is required (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/documents/${publishedId}/redacted-copy`, {
    method: 'POST',
    token: staff.token,
    body: { redactionNote }
  })
  check('either the text or a confirmation is required (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/documents/${publishedId}/redacted-copy`, {
    method: 'POST',
    token: staff.token,
    body: { redactionNote, body: 'Present: [student name redacted]. Motion carried.', confirmExistingTextSafe: true }
  })
  check('supplying both text and confirmation is refused (400)', r._s === 400, `${r._s}`)

  const redactedBody = 'Present: [student name redacted]. Motion carried.'
  r = await api(`/api/documents/${publishedId}/redacted-copy`, {
    method: 'POST',
    token: staff.token,
    body: { redactionNote, body: redactedBody }
  })
  const redactedVersion = r._b?.version?.version
  check('the redacted copy is filed as its own version (201)', r._s === 201 && r._b?.version?.isRedacted === true, `${r._s} ${JSON.stringify(r._b?.version)}`)
  check('the document points at it and keeps its note', r._b?.document?.redactedVersionId !== null && r._b?.document?.redactionNote === redactionNote, JSON.stringify(r._b?.document))

  const stored = await prisma.document.findUnique({ where: { id: publishedId }, select: { redactedVersionId: true, currentVersion: true } })
  check('the original is still the current version of the record', stored?.currentVersion === 1 && stored?.redactedVersionId !== null, JSON.stringify(stored))

  const redactionAudit = await prisma.auditLog.findFirst({
    where: { action: 'document_redacted_copy_prepared', details: { contains: publishedId } },
    orderBy: { createdAt: 'desc' }
  })
  const redactionDetails = redactionAudit ? JSON.parse(redactionAudit.details ?? '{}') : {}
  check('preparing the copy is audited with who, when and the note', !!redactionAudit
  && redactionDetails.actorName === 'E2E staff'
  && redactionDetails.redactionNote === redactionNote
  && !!redactionDetails.preparedAt, JSON.stringify(redactionDetails))

  r = await api(`/api/documents/public/${publishedId}`)
  check('the public detail serves the redacted text (200)', r._s === 200 && r._b?.document?.body === redactedBody, `${r._s} ${JSON.stringify(r._b?.document?.body)}`)
  check('and never the original phrase', !JSON.stringify(r._b ?? {}).includes(protectedName), 'the protected name leaked into the public detail')
  check('and marks itself a redacted copy', r._b?.document?.isRedacted === true && r._b?.document?.version === redactedVersion, JSON.stringify({ is: r._b?.document?.isRedacted, v: r._b?.document?.version }))
  check('the redaction note is visible with who prepared it', r._b?.document?.redaction?.note === redactionNote
  && r._b?.document?.redaction?.preparedBy === 'E2E staff', JSON.stringify(r._b?.document?.redaction))
  check('the original version list is withheld from the public copy', r._b?.document?.versions === null, JSON.stringify(r._b?.document?.versions))

  r = await api(`/api/documents/public/${publishedId}`, { query: { version: 1 } })
  check('asking for the original version is refused (404)', r._s === 404, `${r._s}`)
  r = await api(`/api/documents/public/${publishedId}`, { query: { version: redactedVersion } })
  check('asking for the published version works (200)', r._s === 200 && r._b?.document?.version === redactedVersion, `${r._s}`)

  r = await api('/api/documents/public', { query: { typeId } })
  const listed = (r._b?.documents ?? []).find((d: { id: string }) => d.id === publishedId)
  check('the public list marks the row as a redacted copy', !!listed && listed.isRedacted === true && listed.redactionNote === redactionNote, JSON.stringify(listed))
  check('its summary is built from the redacted text', !!listed && !String(listed.summary ?? '').includes(protectedName), String(listed?.summary))
  check('the public list payload never carries the original body', !JSON.stringify(r._b ?? {}).includes(protectedName), 'the protected name leaked into the public list')

  r = await api('/api/documents/public', { query: { typeId, q: protectedName } })
  check('public search can no longer find the redacted name', r._s === 200 && !(r._b?.documents ?? []).some((d: { id: string }) => d.id === publishedId), JSON.stringify(r._b?.documents?.length))
  r = await api('/api/documents/public', { query: { typeId, q: 'student name redacted' } })
  check('but it does find the redacted wording', (r._b?.documents ?? []).some((d: { id: string }) => d.id === publishedId), JSON.stringify(r._b?.documents?.length))

  const deniedOriginal = await fetch(`${BASE_URL}/api/documents/${publishedId}/attachments/${originalFile.attachmentId}`)
  check('the original attachment is refused once a copy is in force', deniedOriginal.status === 404, `${deniedOriginal.status}`)

  console.log('\n--- a redacted attachment is what the public downloads ---')
  r = await api(`/api/documents/${publishedId}/redacted-copy`, {
    method: 'POST',
    token: staff.token,
    body: {
      redactionNote: 'Replaced the scanned original with a redacted text file.',
      fileName: 'public-notes.txt',
      mime: 'text/plain',
      dataBase64: Buffer.from(`${redactedBody}\nPublic file for ${tag}`).toString('base64')
    }
  })
  check('a redacted copy can carry its own file (201)', r._s === 201 && r._b?.version?.version > redactedVersion, `${r._s} ${JSON.stringify(r._b?.version)}`)
  const publicAttachment = await prisma.documentAttachment.findFirst({
    where: { documentId: publishedId, fileName: 'public-notes.txt' }
  })
  if (publicAttachment) made.storageKeys.push(publicAttachment.storageKey)
  check('the public file is stored against the new copy', !!publicAttachment && publicAttachment.versionId === r._b?.document?.redactedVersionId, JSON.stringify(publicAttachment?.versionId))

  const servedFile = await fetch(`${BASE_URL}/api/documents/${publishedId}/attachments/${publicAttachment!.id}`)
  check('a visitor can download the redacted file (200)', servedFile.status === 200, `${servedFile.status}`)
  check('and it carries the redacted text, not the original name', (await servedFile.text()).includes('[student name redacted]'), 'body mismatch')

  r = await api(`/api/documents/public/${publishedId}`)
  check('the public detail lists only the copy’s file', JSON.stringify((r._b?.document?.attachments ?? []).map((a: { fileName: string }) => a.fileName)) === JSON.stringify(['public-notes.txt']), JSON.stringify(r._b?.document?.attachments))

  console.log('\n--- a copy prepared first makes publishing a plain audited act ---')
  r = await file(staff.token, {
    typeId,
    year,
    title: `${tag} Report on the coastal cleanup`,
    body: `Participants included ${protectedName}.`,
    classification: 'officers'
  })
  const copyFirstId = r._b?.document?.id
  check('the second officers-only document is filed (201)', r._s === 201 && !!copyFirstId, `${r._s}`)

  r = await api(`/api/documents/${copyFirstId}/redacted-copy`, {
    method: 'POST',
    token: manager.token,
    body: { redactionNote: 'Participants are summarised, not named.', body: 'Participants: 42 students and 6 officers.' }
  })
  check('a redacted copy is prepared before publication (201)', r._s === 201, `${r._s}`)

  r = await api(`/api/documents/${copyFirstId}`, { method: 'PUT', token: manager.token, body: { classification: 'public' } })
  check('publishing with a copy needs no confirmation flag (200)', r._s === 200 && r._b?.document?.classification === 'public', `${r._s} ${r._b?.document?.classification}`)

  const safeAudit = await prisma.auditLog.findFirst({
    where: { action: 'document_published', targetId: copyFirstId },
    orderBy: { createdAt: 'desc' }
  })
  const safeDetails = safeAudit ? JSON.parse(safeAudit.details ?? '{}') : {}
  check('the safe publish is audited as such', !!safeAudit && safeDetails.redactedCopyInForce === true
  && safeDetails.redactedVersionId !== null && safeAudit?.performedBy === manager.id, JSON.stringify({ details: safeDetails, actor: safeAudit?.performedBy }))

  r = await api(`/api/documents/public/${copyFirstId}`)
  check('the public sees the copy, not the original name', r._s === 200
  && r._b?.document?.body === 'Participants: 42 students and 6 officers.'
  && !JSON.stringify(r._b ?? {}).includes(protectedName), `${r._s}`)

  console.log('\n--- classification can move back out of public ---')
  r = await api(`/api/documents/${copyFirstId}`, { method: 'PUT', token: manager.token, body: { classification: 'restricted' } })
  check('a public filing can be restricted (200)', r._s === 200 && r._b?.document?.classification === 'restricted', `${r._s}`)
  const unpublishAudit = await prisma.auditLog.findFirst({
    where: { action: 'document_unpublished', targetId: copyFirstId },
    orderBy: { createdAt: 'desc' }
  })
  check('leaving public is audited too', !!unpublishAudit, 'no document_unpublished row')
  r = await api(`/api/documents/public/${copyFirstId}`)
  check('and it disappears from the public archive (404)', r._s === 404, `${r._s}`)

  console.log('\n--- archiving refuses a new copy, and the note survives ---')
  r = await api(`/api/documents/${copyFirstId}`, { method: 'PUT', token: manager.token, body: { archived: true } })
  check('the filing can be archived (200)', r._s === 200 && r._b?.document?.archived === true, `${r._s}`)
  r = await api(`/api/documents/${copyFirstId}/redacted-copy`, {
    method: 'POST',
    token: manager.token,
    body: { redactionNote: 'Should not be accepted.', body: 'Anything.' }
  })
  check('an archived filing refuses a new redacted copy (409)', r._s === 409, `${r._s}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  const documentIds = made.documentIds.filter(Boolean)
  if (documentIds.length > 0) {
    const attachments = await prisma.documentAttachment.findMany({ where: { documentId: { in: documentIds } }, select: { storageKey: true } })
    made.storageKeys.push(...attachments.map(attachment => attachment.storageKey))
  }

  try {
    const { rm } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const root = resolve(process.env.DOCUMENT_STORAGE_PATH ?? '.local/documents')
    for (const key of made.storageKeys) {
      if (key.includes('..')) continue
      await rm(resolve(root, key), { force: true }).catch(() => {})
    }
  } catch { /* nothing to remove */ }

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
