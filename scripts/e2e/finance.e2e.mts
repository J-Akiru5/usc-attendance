// Live end-to-end test: finance, budget & liquidation (plan §8.7). Proves the
// acceptance path — an expense cannot exceed the remaining line budget without an
// explicit audited override, a proposal cannot be approved before every noted
// step exists, liquidation totals reconcile with the lines and the receipts, and
// every step is in the audit trail — plus the summary-only public board.
// Throwaway data, deleted afterwards.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { api } from './client.mts'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2efin' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

// 1x1 transparent PNG: a stand-in receipt / signed copy.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const png = (name: string) => ({ mime: 'image/png', dataBase64: PNG_BASE64, name })

const peso = (centavos: number) => `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const made: {
  userIds: string[]
  semesterIds: string[]
  budgetIds: string[]
  proposalIds: string[]
  storageKeys: string[]
} = { userIds: [], semesterIds: [], budgetIds: [], proposalIds: [], storageKeys: [] }

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

/**
 * The org-chart roles the migration seeds (plan §7.2). Upserted so the suite is
 * self-contained whether or not the migration has been applied yet, with the
 * migration's own names so its ON CONFLICT inserts stay consistent.
 */
const ORG_ROLES: Record<string, { name: string, capabilities: string[] }> = {
  treasurer: { name: 'Treasurer (finance)', capabilities: ['finance.manage', 'finance.audit'] },
  finance_noter: { name: 'Finance noter (President)', capabilities: ['finance.note', 'finance.audit'] },
  auditor: { name: 'Auditor', capabilities: ['finance.audit'] }
}

async function grantRole(userId: string, key: keyof typeof ORG_ROLES) {
  const spec = ORG_ROLES[key]!
  const role = await prisma.role.upsert({
    where: { key },
    update: {},
    create: { key, name: spec.name, system: true }
  })
  for (const capability of spec.capabilities) {
    await prisma.roleCapability.upsert({
      where: { roleId_capability: { roleId: role.id, capability } },
      update: {},
      create: { roleId: role.id, capability }
    })
  }
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id }
  })
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000)
}

async function main() {
  const treasurer = await mkUser('treasurer', { role: 'staff' })
  const noter = await mkUser('noter', { role: 'staff' })
  const auditor = await mkUser('auditor', { role: 'staff' })
  const staff = await mkUser('staff', { role: 'staff' })
  const student = await mkUser('student', { role: 'student' })
  await prisma.studentProfile.create({ data: { userId: student.id, studentNo: `${tag.slice(-7)}1` } })
  await grantRole(treasurer.id, 'treasurer')
  await grantRole(noter.id, 'finance_noter')
  await grantRole(auditor.id, 'auditor')

  // A throwaway semester that covers now and starts later than any real one, so
  // the public summary board resolves ITS budget rather than a seeded one.
  const semester = await prisma.semester.create({
    data: { name: `${tag} semester`, startsOn: new Date(Date.now() - 3600_000), endsOn: daysFromNow(60) }
  })
  made.semesterIds.push(semester.id)

  console.log('\n--- who may touch the council\'s money ---')
  let r = await api('/api/finance/budget', { token: staff.token })
  check('a plain officer cannot read the budget (403)', r._s === 403, `${r._s}`)

  r = await api('/api/finance/budget', { token: student.token })
  check('a student cannot read it either (403)', r._s === 403, `${r._s}`)

  r = await api('/api/finance/budget')
  check('an anonymous caller is refused (401)', r._s === 401, `${r._s}`)

  r = await api('/api/finance/budget', { token: auditor.token })
  check('the Auditor reads everything (200)', r._s === 200 && Array.isArray(r._b?.semesters), `${r._s}`)

  r = await api('/api/finance/budget', {
    method: 'POST',
    token: auditor.token,
    body: { semesterId: semester.id }
  })
  check('but does not open a budget (403)', r._s === 403, `${r._s}`)

  console.log('\n--- the semester budget ---')
  r = await api('/api/finance/budget', { method: 'POST', token: treasurer.token, body: { semesterId: semester.id } })
  const budgetId = r._b?.budget?.id
  if (r._s === 201) made.budgetIds.push(budgetId)
  check('the Treasurer opens the semester budget (201)', r._s === 201 && budgetId, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/finance/budget', { method: 'POST', token: treasurer.token, body: { semesterId: semester.id } })
  check('one budget per semester (409)', r._s === 409, `${r._s}`)

  r = await api('/api/finance/lines', {
    method: 'POST',
    token: treasurer.token,
    body: { budgetId, name: `${tag} supplies`, category: 'supplies', allocatedCentavos: 100_000 }
  })
  const lineId = r._b?.line?.id
  check('a line item is added with its allocation (201)', r._s === 201 && r._b?.line?.allocatedCentavos === 100_000, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/finance/lines', {
    method: 'POST',
    token: treasurer.token,
    body: { budgetId, name: `${tag} supplies`, category: 'supplies', allocatedCentavos: 1 }
  })
  check('two lines cannot share a name (409)', r._s === 409, `${r._s}`)

  r = await api(`/api/finance/lines/${lineId}`, { method: 'PUT', token: treasurer.token, body: { allocatedCentavos: 100_000, notes: 'seeded by the live suite' } })
  check('the allocation can be re-saved (200)', r._s === 200 && r._b?.totals?.remainingCentavos === 100_000, `${r._s} ${JSON.stringify(r._b?.totals)}`)

  console.log('\n--- an expense cannot pass the line without an explicit override ---')
  r = await api('/api/finance/entries', {
    method: 'POST',
    token: treasurer.token,
    body: {
      lineId,
      kind: 'expense',
      amountCentavos: 40_000,
      description: `${tag} tarp printing`,
      spentAt: new Date().toISOString().slice(0, 10),
      receipt: png('tarp.png')
    }
  })
  const tarpEntryId = r._b?.entry?.id
  check('an expense with its receipt is recorded (201)', r._s === 201 && r._b?.entry?.hasReceipt === true, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/finance/entries', {
    method: 'POST',
    token: treasurer.token,
    body: { lineId, kind: 'expense', amountCentavos: 80_000, description: `${tag} too big`, spentAt: new Date().toISOString().slice(0, 10) }
  })
  check('an expense past the remaining budget is refused (409)', r._s === 409, `${r._s}`)
  check('and it says by how much and what is left', /200\.00/.test(r._b?.error ?? '') && /600\.00/.test(r._b?.error ?? ''), r._b?.error)

  const beforeOverride = await prisma.budgetEntry.count({ where: { lineId } })
  check('nothing was written by the refused expense', beforeOverride === 1, `${beforeOverride}`)

  r = await api('/api/finance/entries', {
    method: 'POST',
    token: treasurer.token,
    body: {
      lineId,
      kind: 'expense',
      amountCentavos: 80_000,
      description: `${tag} emergency purchase`,
      spentAt: new Date().toISOString().slice(0, 10),
      override: true
    }
  })
  check('an override without a reason is refused (400)', r._s === 400, `${r._s}`)

  const overrideReason = 'The council approved the extra spend in the 2026-10-15 session'
  r = await api('/api/finance/entries', {
    method: 'POST',
    token: treasurer.token,
    body: {
      lineId,
      kind: 'expense',
      amountCentavos: 80_000,
      description: `${tag} emergency purchase`,
      spentAt: new Date().toISOString().slice(0, 10),
      override: true,
      overrideReason
    }
  })
  const overrideEntryId = r._b?.entry?.id
  check('the explicit override goes through and is marked (201)', r._s === 201 && r._b?.overridden === true, `${r._s} ${JSON.stringify(r._b?.overridden)}`)
  check('the override is kept on the row', (await prisma.budgetEntry.findUnique({ where: { id: overrideEntryId } }))?.overrideReason === overrideReason)

  const overrideAudit = await prisma.auditLog.findMany({ where: { action: 'finance_budget_override', details: { contains: overrideEntryId ?? tag } } })
  check('and it is in the audit trail with its numbers', overrideAudit.length === 1 && (overrideAudit[0]?.details ?? '').includes(overrideReason), JSON.stringify(overrideAudit[0]?.details))

  r = await api('/api/finance/entries', {
    method: 'POST',
    token: treasurer.token,
    body: {
      lineId,
      kind: 'income',
      amountCentavos: 30_000,
      source: 'fees',
      description: `${tag} membership fees`,
      spentAt: new Date().toISOString().slice(0, 10)
    }
  })
  check('income is recorded against the line (201)', r._s === 201, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/finance/budget', { token: auditor.token, query: { semesterId: semester.id } })
  const line = (r._b?.lines ?? [])[0]
  check('the line totals reconcile (1,000 + 300 − 1,200 = 100)', line?.remainingCentavos === 10_000, JSON.stringify(line))
  check('the budget totals reconcile too', r._b?.totals?.expenseCentavos === 120_000 && r._b?.totals?.incomeCentavos === 30_000, JSON.stringify(r._b?.totals))

  console.log('\n--- receipts ---')
  r = await api(`/api/finance/entries/${tarpEntryId}/receipt`, { token: treasurer.token })
  check('the receipt comes back as stored bytes (200)', r._s === 200 && Buffer.isBuffer(r._b) && r._b.subarray(1, 4).toString() === 'PNG', `${r._s} ${r._h['content-type']}`)

  r = await api(`/api/finance/entries/${tarpEntryId}/receipt`, { token: auditor.token })
  check('the Auditor may read it (200)', r._s === 200, `${r._s}`)

  r = await api(`/api/finance/entries/${tarpEntryId}/receipt`, { token: student.token })
  check('a student may not (403)', r._s === 403, `${r._s}`)

  console.log('\n--- the proposal workflow cannot be skipped ---')
  r = await api('/api/finance/proposals', {
    method: 'POST',
    token: treasurer.token,
    body: {
      budgetId,
      lineId,
      title: `${tag} sound system`,
      description: 'Rental and operator for the general assembly',
      amountCentavos: 12_000,
      minutesReference: 'Minutes of 2026-10-15, item 4'
    }
  })
  const proposalA = r._b?.proposal?.id
  if (r._s === 201) made.proposalIds.push(proposalA)
  check('a proposal starts at "decided by the body" (201)', r._s === 201 && r._b?.proposal?.status === 'decided', `${r._s} ${JSON.stringify(r._b?.proposal?.status)}`)
  check('with the minutes it came from', (r._b?.proposal?.steps ?? []).some((s: { step: string, note: string }) => s.step === 'decided' && /Minutes/.test(s.note ?? '')), JSON.stringify(r._b?.proposal?.steps))

  r = await api('/api/finance/proposals', {
    method: 'POST',
    token: noter.token,
    body: { budgetId, title: `${tag} not mine to raise`, description: 'x'.repeat(20), amountCentavos: 1, minutesReference: 'Minutes item 9' }
  })
  check('a noter does not raise proposals (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'approved' } })
  check('approval is refused before any note exists (409)', r._s === 409, `${r._s}`)
  check('and the refusal names who must note it first', ['President', 'Adviser', 'University Accountant'].every(who => (r._b?.error ?? '').includes(who)), r._b?.error)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: noter.token, body: { step: 'approved' } })
  check('a noter cannot record the Campus Administrator\'s approval (403)', r._s === 403, `${r._s}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: noter.token, body: { step: 'noted_president' } })
  check('the President records their own note in-app (201)', r._s === 201 && r._b?.proposal?.status === 'decided', `${r._s} ${JSON.stringify(r._b?.proposal?.status)}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'noted_university_accountant', signatoryName: 'A. Cruz' } })
  check('the University Accountant\'s note needs the signed copy (400)', r._s === 400, `${r._s} ${r._b?.error}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, {
    method: 'POST',
    token: treasurer.token,
    body: { step: 'noted_university_accountant', signatoryName: 'A. Cruz', actedAt: new Date().toISOString().slice(0, 10), attachment: png('accountant.png') }
  })
  check('the Treasurer records the external note with its signed copy (201)', r._s === 201 && (r._b?.step?.signatoryRole === 'University Accountant') && !!r._b?.step?.attachmentKey, `${r._s} ${JSON.stringify(r._b?.step?.signatoryRole)}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'approved', signatoryName: 'B. Reyes', attachment: png('administrator.png') } })
  check('approval still waits for the Adviser (409)', r._s === 409 && /Adviser/.test(r._b?.error ?? ''), `${r._s} ${r._b?.error}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'noted_adviser' } })
  check('the Adviser\'s note can be recorded by the Treasurer when they are not in the app (201)', r._s === 201, `${r._s}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'approved', signatoryName: 'B. Reyes', attachment: png('administrator.png') } })
  check('with every note in, the Campus Administrator approves it (201)', r._s === 201 && r._b?.proposal?.status === 'approved', `${r._s} ${JSON.stringify(r._b?.proposal?.status)}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'released' } })
  check('a release needs its reference (400)', r._s === 400, `${r._s}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'released', note: 'Voucher 2026-014' } })
  check('then it is released (201)', r._s === 201 && r._b?.proposal?.status === 'released', `${r._s} ${JSON.stringify(r._b?.proposal?.status)}`)

  console.log('\n--- release gates the spending, receipts gate the liquidation ---')
  r = await api('/api/finance/proposals', {
    method: 'POST',
    token: treasurer.token,
    body: {
      budgetId,
      lineId,
      title: `${tag} outreach tarps`,
      description: 'Tarpaulins for the community outreach',
      amountCentavos: 5_000,
      minutesReference: 'Minutes of 2026-10-15, item 5'
    }
  })
  const proposalB = r._b?.proposal?.id
  if (r._s === 201) made.proposalIds.push(proposalB)

  r = await api('/api/finance/entries', {
    method: 'POST',
    token: treasurer.token,
    body: {
      lineId,
      kind: 'expense',
      amountCentavos: 1_000,
      description: `${tag} before the release`,
      spentAt: new Date().toISOString().slice(0, 10),
      proposalId: proposalB
    }
  })
  check('an expense cannot be charged to a proposal that is not released (409)', r._s === 409, `${r._s} ${r._b?.error}`)

  for (const step of ['noted_president', 'noted_adviser']) {
    r = await api(`/api/finance/proposals/${proposalB}/steps`, { method: 'POST', token: treasurer.token, body: { step } })
    check(`B: ${step} recorded (201)`, r._s === 201, `${r._s} ${r._b?.error}`)
  }
  r = await api(`/api/finance/proposals/${proposalB}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'noted_university_accountant', signatoryName: 'A. Cruz', attachment: png('accountant.png') } })
  check('B: the accountant notes it (201)', r._s === 201, `${r._s} ${r._b?.error}`)
  r = await api(`/api/finance/proposals/${proposalB}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'approved', signatoryName: 'B. Reyes', attachment: png('administrator.png') } })
  check('B: the Campus Administrator approves it (201)', r._s === 201 && r._b?.proposal?.status === 'approved', `${r._s}`)
  r = await api(`/api/finance/proposals/${proposalB}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'released', note: 'Voucher 2026-015' } })
  check('B: released (201)', r._s === 201 && r._b?.proposal?.status === 'released', `${r._s}`)

  r = await api('/api/finance/entries', {
    method: 'POST',
    token: treasurer.token,
    body: {
      lineId,
      kind: 'expense',
      amountCentavos: 1_000,
      description: `${tag} B spend without a receipt`,
      spentAt: new Date().toISOString().slice(0, 10),
      proposalId: proposalB
    }
  })
  check('B: an expense charged to the released proposal is recorded (201)', r._s === 201, `${r._s} ${r._b?.error}`)

  r = await api(`/api/finance/proposals/${proposalB}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'liquidated', note: 'Done' } })
  check('B: liquidation is refused while an expense has no receipt (409)', r._s === 409 && /receipt/i.test(r._b?.error ?? ''), `${r._s} ${r._b?.error}`)

  r = await api(`/api/finance/proposals/${proposalB}`, { token: auditor.token })
  check('B: the detail names the missing receipt', r._b?.reconciliation?.receiptsMissing === 1, JSON.stringify(r._b?.reconciliation))

  console.log('\n--- liquidation reconciles with the lines and the receipts ---')
  r = await api('/api/finance/entries', {
    method: 'POST',
    token: treasurer.token,
    body: {
      lineId,
      kind: 'expense',
      amountCentavos: 10_000,
      description: `${tag} A spend`,
      spentAt: new Date().toISOString().slice(0, 10),
      proposalId: proposalA,
      receipt: png('sound.png')
    }
  })
  check('A: the released proposal takes the expense (201)', r._s === 201 && r._b?.entry?.hasReceipt === true, `${r._s} ${JSON.stringify(r._b?.entry)}`)

  r = await api(`/api/finance/proposals/${proposalA}/steps`, { method: 'POST', token: treasurer.token, body: { step: 'liquidated', note: 'Receipted and closed' } })
  check('A: every expense has its receipt, so it liquidates (201)', r._s === 201 && r._b?.proposal?.status === 'liquidated', `${r._s} ${r._b?.error}`)

  r = await api(`/api/finance/proposals/${proposalA}`, { token: treasurer.token })
  const reconciliation = r._b?.reconciliation
  check('A: proposed 120.00, spent 100.00, variance 20.00', reconciliation?.proposedCentavos === 12_000 && reconciliation?.spentCentavos === 10_000 && reconciliation?.varianceCentavos === 2_000, JSON.stringify(reconciliation))
  check('A: the pesos the documents print agree', reconciliation?.proposedPesos === peso(12_000) && reconciliation?.spentPesos === peso(10_000) && reconciliation?.variancePesos === peso(2_000), JSON.stringify(reconciliation))

  r = await api('/api/finance/liquidation', { token: treasurer.token, query: { proposalId: proposalA, format: 'csv' } })
  const csv = String(r._b ?? '')
  check('the liquidation CSV comes back (200)', r._s === 200 && r._h['content-type']?.includes('text/csv'), `${r._s} ${r._h['content-type']}`)
  check('with the approval trail and the signatories', csv.includes('Approval trail') && csv.includes('A. Cruz (University Accountant)') && csv.includes('B. Reyes (Campus Administrator)'), csv.slice(0, 200))
  check('with the expense, its receipt and the totals', csv.includes('sound.png') && csv.includes(peso(10_000)) && csv.includes('Total expenses'), 'missing rows')
  check('and the reconciliation line', csv.includes(peso(12_000)) && csv.includes(peso(2_000)) && csv.includes('underspent'), 'missing reconciliation')

  r = await api('/api/finance/liquidation', { token: auditor.token, query: { proposalId: proposalA, format: 'xlsx' } })
  check('the Excel liquidation is a workbook (200)', r._s === 200 && Buffer.isBuffer(r._b) && r._b.length > 1_000 && r._h['content-type']?.includes('spreadsheetml'), `${r._s} ${r._b?.length} ${r._h['content-type']}`)

  r = await api('/api/finance/liquidation', { token: auditor.token, query: { proposalId: proposalA, format: 'pdf' } })
  check('the PDF liquidation is a PDF (200)', r._s === 200 && Buffer.isBuffer(r._b) && r._b.subarray(0, 5).toString() === '%PDF-', `${r._s}`)

  r = await api('/api/finance/liquidation', { token: treasurer.token })
  check('liquidation without a proposal is refused (400)', r._s === 400, `${r._s}`)

  r = await api('/api/finance/liquidation', { token: treasurer.token, query: { proposalId: 'does-not-exist' } })
  check('and an unknown proposal is a 404', r._s === 404, `${r._s}`)

  r = await api('/api/finance/liquidation', { token: student.token, query: { proposalId: proposalA } })
  check('a student cannot export it (403)', r._s === 403, `${r._s}`)

  console.log('\n--- every step is timestamped and audited ---')
  const stepRows = await prisma.proposalStep.findMany({ where: { proposalId: proposalA }, orderBy: { actedAt: 'asc' } })
  check('A carries all seven steps', stepRows.length === 7, `${stepRows.length} ${stepRows.map(s => s.step).join(',')}`)
  check('each one has its date and who recorded it', stepRows.every(s => s.actedAt instanceof Date && s.actorUserId !== null), JSON.stringify(stepRows.map(s => ({ step: s.step, at: s.actedAt }))))
  const externalNote = stepRows.find(s => s.step === 'noted_university_accountant')
  check('the external note keeps the signatory and the signed copy', externalNote?.signatoryName === 'A. Cruz' && externalNote?.signatoryRole === 'University Accountant' && !!externalNote?.attachmentKey, JSON.stringify(externalNote))
  const presidentNote = stepRows.find(s => s.step === 'noted_president')
  check('the in-app note keeps the officer who made it, not a typed name', presidentNote?.signatoryName === 'E2E noter' && presidentNote?.actorUserId === noter.id, JSON.stringify({ name: presidentNote?.signatoryName, actor: presidentNote?.actorUserId }))

  const auditRows = await prisma.auditLog.findMany({ where: { OR: [{ details: { contains: proposalA } }, { details: { contains: proposalB } }] } })
  const auditActions = new Set(auditRows.map(a => a.action))
  const auditDetails = auditRows.map(a => a.details ?? '').join('|')
  check('the proposal creation and every step are in the audit trail', auditActions.has('finance_proposal_created') && auditActions.has('finance_proposal_step'), [...auditActions].join(','))
  const auditedSteps = ['decided', 'noted_president', 'noted_adviser', 'noted_university_accountant', 'approved', 'released', 'liquidated']
  check('including each named step, in order', auditedSteps.every(step => auditDetails.includes(`"step":"${step}"`)), auditedSteps.filter(step => !auditDetails.includes(`"step":"${step}"`)).join(','))
  check('the ledger writes are audited too', auditActions.has('finance_entry_recorded') && auditActions.has('finance_budget_override'), [...auditActions].join(','))

  const attachmentId = externalNote?.id
  r = await api(`/api/finance/steps/${attachmentId}/attachment`, { token: auditor.token })
  check('the signed copy of a step is readable (200)', r._s === 200 && Buffer.isBuffer(r._b), `${r._s}`)
  r = await api(`/api/finance/steps/${attachmentId}/attachment`, { token: student.token })
  check('but not by a student (403)', r._s === 403, `${r._s}`)

  console.log('\n--- the transparency board is off until the council says otherwise ---')
  r = await api('/api/transparency')
  check('the public board is closed by default (enabled: false)', r._s === 200 && r._b?.enabled === false, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/settings/transparency', { method: 'PUT', token: student.token, body: { transparencyPublic: true } })
  check('a student cannot switch it on (403)', r._s === 403, `${r._s}`)

  r = await api('/api/settings/transparency', { method: 'PUT', token: treasurer.token, body: { transparencyPublic: true, transparencyNote: 'Figures as of the 1st semester' } })
  check('the Treasurer switches it on (200)', r._s === 200 && r._b?.transparencyPublic === true, `${r._s} ${JSON.stringify(r._b)}`)

  r = await api('/api/transparency')
  const boardText = JSON.stringify(r._b)
  check('the board is public now (enabled: true)', r._s === 200 && r._b?.enabled === true && r._b?.semester?.name === semester.name, `${r._s} ${boardText.slice(0, 200)}`)
  check('it carries the line and its totals', (r._b?.lines ?? []).some((l: { name: string, remainingCentavos: number }) => l.name === `${tag} supplies` && l.remainingCentavos === 10_000), JSON.stringify(r._b?.lines))
  check('and the summary note', r._b?.note === 'Figures as of the 1st semester', `${r._b?.note}`)
  check('it exposes no student data, names or receipts', !boardText.includes('@example.invalid')
  && !boardText.includes('E2E ')
  && !boardText.includes('studentNo')
  && !boardText.includes('receipt')
  && !boardText.includes('sound.png')
  && !boardText.includes('Voucher'), boardText.slice(0, 400))
  check('proposals are only a count per stage', typeof r._b?.proposals?.total === 'number' && !boardText.includes(`${tag} sound system`), JSON.stringify(r._b?.proposals))

  r = await api('/api/settings/transparency', { method: 'PUT', token: noter.token, body: { transparencyPublic: false } })
  check('a noter may not switch it (403)', r._s === 403, `${r._s}`)

  r = await api('/api/settings/transparency', { method: 'PUT', token: treasurer.token, body: { transparencyPublic: false } })
  check('and the council can switch it back off (200)', r._s === 200 && r._b?.transparencyPublic === false, `${r._s}`)

  r = await api('/api/transparency')
  check('the board is closed again', r._b?.enabled === false, JSON.stringify(r._b))
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  if (made.budgetIds.length) {
    const entries = await prisma.budgetEntry.findMany({
      where: { line: { budgetId: { in: made.budgetIds } } },
      select: { receiptKey: true }
    })
    const steps = await prisma.proposalStep.findMany({
      where: { proposal: { budgetId: { in: made.budgetIds } } },
      select: { attachmentKey: true }
    })
    made.storageKeys.push(
      ...entries.map(e => e.receiptKey).filter((k): k is string => !!k),
      ...steps.map(s => s.attachmentKey).filter((k): k is string => !!k)
    )

    await prisma.budgetEntry.deleteMany({ where: { line: { budgetId: { in: made.budgetIds } } } })
    await prisma.budgetProposal.deleteMany({ where: { budgetId: { in: made.budgetIds } } })
    await prisma.budgetLine.deleteMany({ where: { budgetId: { in: made.budgetIds } } })
    await prisma.budget.deleteMany({ where: { id: { in: made.budgetIds } } })
  }
  if (made.semesterIds.length) await prisma.semester.deleteMany({ where: { id: { in: made.semesterIds } } })

  // The transparency switch is global state: leave it as it was found (off).
  await prisma.financeSettings.updateMany({ data: { transparencyPublic: false, transparencyNote: null, updatedBy: null } })

  // Receipts and signed copies live outside the database (plan §11.1); remove the
  // throwaway ones from the filesystem backend when that is what was used.
  for (const key of made.storageKeys) {
    await rm(resolve(process.env.FINANCE_STORAGE_PATH ?? '.local/finance', key), { force: true }).catch(() => {})
  }

  if (made.userIds.length) {
    await prisma.userRole.deleteMany({ where: { userId: { in: made.userIds } } })
    await prisma.auditLog.deleteMany({
      where: { OR: [{ userId: { in: made.userIds } }, { performedBy: { in: made.userIds } }, { details: { contains: tag } }] }
    })
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
