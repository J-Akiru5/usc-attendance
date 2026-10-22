// Live end-to-end test: announcements (plan §8.4). The phase's acceptance asks
// that "a scheduled announcement to one college reaches only that college" and
// that an email unsubscribe is honoured — both are proven here through the
// notification core, with the local email capture showing who was mailed.
// Throwaway data, deleted afterwards.
// Run: npx tsx scripts/e2e/run.mts   (starts the dev server for you)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { api, capturedEmails, clearCapturedEmails } from './client.mts'
import { dailyLimit, utcDayStart } from '../../server/utils/email-quota'

process.env.QR_SECRET ||= 'e2e-test-secret-' + randomBytes(8).toString('hex')
process.env.SITE_URL ||= process.env.BASE_URL || 'http://localhost:3000'

const prisma = new PrismaClient()
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const tag = 'e2eann' + Date.now()
let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`)
}

const made: { userIds: string[], announcementIds: string[], sectionIds: string[] } = { userIds: [], announcementIds: [], sectionIds: [] }

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
  return { id: data.user.id, email, token: s.session.access_token }
}

async function main() {
  const staff = await mkUser('staff', { role: 'staff' })
  const manager = await mkUser('manager', { role: 'super_admin', canConfigure: true })
  const student = await mkUser('student', { role: 'student' })

  const academic = await api('/api/reference/academic')
  const colleges = (academic._b?.colleges ?? []) as Array<{
    id: string
    code: string
    name: string
    programs?: Array<{ sections?: Array<{ id: string, name: string }> }>
  }>
  // Sections are nested under programs in the reference tree.
  const sections = colleges.flatMap(college => (college.programs ?? []).flatMap(program => program.sections ?? []))
  const collegeA = colleges[0]!
  const collegeB = colleges.find(c => c.id !== collegeA.id)
  let sectionA = (collegeA.programs ?? []).flatMap(program => program.sections ?? [])[0] ?? sections[0]
  // The dev seed may carry no sections at all. Create a throwaway one so the
  // section audience is exercised against a real recipient instead of failing
  // on missing seed data - and clean it up with the rest of the fixture.
  if (!sectionA) {
    const program = await prisma.program.findFirst({ select: { id: true } })
    if (program) {
      sectionA = await prisma.section.create({ data: { programId: program.id, yearLevel: 2, name: `${tag} sec` } })
      made.sectionIds.push(sectionA.id)
    }
  }

  // Two students inside collegeA, one outside it. One of them sits in a
  // section so every audience type has a countable audience.
  const insideA = await mkUser('insidea', { role: 'student' })
  const insideB = await mkUser('insideb', { role: 'student' })
  const outside = await mkUser('outside', { role: 'student' })
  await prisma.studentProfile.create({ data: { userId: insideA.id, studentNo: `${tag.slice(-7)}1`, collegeId: collegeA.id, yearLevel: 2, sectionId: sectionA?.id ?? null } })
  await prisma.studentProfile.create({ data: { userId: insideB.id, studentNo: `${tag.slice(-7)}2`, collegeId: collegeA.id, yearLevel: 3 } })
  await prisma.studentProfile.create({ data: { userId: outside.id, studentNo: `${tag.slice(-7)}3`, collegeId: collegeB?.id ?? null, yearLevel: 2 } })

  const notesFor = (userId: string) => prisma.notification.findMany({ where: { userId, kind: 'announcement' }, orderBy: { createdAt: 'desc' } })

  let r: Awaited<ReturnType<typeof api>>

  console.log('\n--- the email audience preview (BC-12) ---')
  r = await api('/api/announcements/preview?audienceType=all', { token: student.token })
  check('a student cannot read the audience preview (403)', r._s === 403, `${r._s}`)

  r = await api('/api/announcements/preview?audienceType=all', { token: staff.token })
  check('the preview counts everyone eligible (200, at least the three seeded)', r._s === 200 && r._b?.eligible >= 3, `${r._s} ${JSON.stringify(r._b?.eligible)}`)
  check('it carries today\'s budget as a number', r._b?.quota?.known === true && Number.isInteger(r._b?.quota?.remaining) && r._b?.quota?.remaining >= 0, JSON.stringify(r._b?.quota))
  const previewJson = JSON.stringify(r._b)
  check('the preview is a count, never a directory', !previewJson.includes(insideA.id) && !previewJson.includes(insideA.email) && !('recipients' in (r._b ?? {})), previewJson.slice(0, 140))

  r = await api(`/api/announcements/preview?audienceType=college&audienceCollegeId=${collegeA.id}`, { token: staff.token })
  check('one college counts only its own students (2)', r._s === 200 && r._b?.eligible === 2, `${r._s} ${JSON.stringify(r._b?.eligible)}`)

  r = await api('/api/announcements/preview?audienceType=yearLevel&audienceYearLevel=2', { token: staff.token })
  check('one year level counts only that year (2)', r._s === 200 && r._b?.eligible === 2, `${r._s} ${JSON.stringify(r._b?.eligible)}`)

  r = await api('/api/announcements/preview?audienceType=yearLevel&audienceYearLevel=3', { token: staff.token })
  check('a different year counts only its own (1)', r._s === 200 && r._b?.eligible === 1, `${r._s} ${JSON.stringify(r._b?.eligible)}`)

  if (sectionA) {
    r = await api(`/api/announcements/preview?audienceType=section&audienceSectionId=${sectionA.id}`, { token: staff.token })
    check('one section counts only its own students (1)', r._s === 200 && r._b?.eligible === 1, `${r._s} ${JSON.stringify(r._b?.eligible)}`)
  } else {
    check('the dev reference data has a section to preview', false, 'no sections returned by /api/reference/academic')
  }

  console.log('\n--- writing one ---')
  r = await api('/api/announcements', { token: student.token })
  check('a student cannot open the announcements desk (403)', r._s === 403, `${r._s}`)

  r = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} draft`, body: 'Nothing to see yet.' }
  })
  const draftId = r._b?.announcement?.id
  if (r._s === 201) made.announcementIds.push(draftId)
  check('a draft is written (201)', r._s === 201 && r._b?.announcement?.status === 'draft', `${r._s} ${JSON.stringify(r._b?.announcement?.status)}`)
  check('a draft reaches nobody', (await notesFor(insideA.id)).length === 0, `${(await notesFor(insideA.id)).length}`)

  r = await api('/api/announcements', { method: 'POST', token: staff.token, body: { title: 'x', body: 'too short title' } })
  check('a one-letter title is refused (400)', r._s === 400, `${r._s}`)

  console.log('\n--- the acceptance: a scheduled notice to one college reaches only that college ---')
  const scheduledStart = new Date(Date.now() - 60_000)
  r = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} college assembly`,
      body: '**Assembly** for your college tomorrow at 7 AM.\n\n- Bring your ID\n- Sign on arrival',
      audienceType: 'college',
      audienceCollegeId: collegeA.id,
      scheduledFor: scheduledStart.toISOString(),
      pinned: true
    }
  })
  const collegeAnnId = r._b?.announcement?.id
  if (r._s === 201) made.announcementIds.push(collegeAnnId)
  check('it is scheduled, not sent (201)', r._s === 201 && r._b?.announcement?.status === 'scheduled', `${r._s} ${JSON.stringify(r._b?.announcement?.status)}`)

  r = await api('/api/cron/announcements')
  check('the cron needs its secret (401)', r._s === 401, `${r._s}`)

  const secret = process.env.CRON_SECRET!
  r = await api('/api/cron/announcements', { headers: { Authorization: `Bearer ${secret}` } })
  check('the cron sends what is due (200)', r._s === 200 && r._b?.due === 1, `${r._s} ${JSON.stringify(r._b?.due)}`)
  const result = (r._b?.results ?? [])[0]
  check('it reached exactly the college', result?.recipients === 2 && result?.sent === 2, JSON.stringify(result))

  check('the students inside the college have it', (await notesFor(insideA.id)).length === 1 && (await notesFor(insideB.id)).length === 1, `${(await notesFor(insideA.id)).length}/${(await notesFor(insideB.id)).length}`)
  check('the student outside does not', (await notesFor(outside.id)).length === 0, `${(await notesFor(outside.id)).length}`)

  const delivered = (await notesFor(insideA.id))[0]
  check('the message arrives as plain text with the markers gone', !!delivered && delivered.body.includes('Assembly for your college') && !delivered.body.includes('**'), JSON.stringify(delivered?.body?.slice(0, 60)))

  r = await api('/api/cron/announcements', { headers: { Authorization: `Bearer ${secret}` } })
  check('running the cron again sends nothing', r._s === 200 && r._b?.due === 0, `${r._s} ${JSON.stringify(r._b?.due)}`)
  check('and the draft is still a draft', (await prisma.announcement.findUnique({ where: { id: draftId } }))?.status === 'draft')

  console.log('\n--- the record is safe ---')
  r = await api(`/api/announcements/${collegeAnnId}`, { method: 'PUT', token: staff.token, body: { title: 'Rewritten history' } })
  check('a sent announcement cannot be reworded (409)', r._s === 409, `${r._s}`)
  r = await api(`/api/announcements/${collegeAnnId}`, { method: 'DELETE', token: staff.token })
  check('nor deleted (409)', r._s === 409, `${r._s}`)
  r = await api(`/api/announcements/${collegeAnnId}`, { method: 'PUT', token: staff.token, body: { pinned: false } })
  check('but it can be unpinned (200)', r._s === 200 && r._b?.pinned === false, `${r._s}`)

  r = await api(`/api/announcements/${draftId}`, { method: 'PUT', token: staff.token, body: { title: `${tag} draft v2`, pinned: true } })
  check('a draft can still be edited (200)', r._s === 200 && r._b?.title === `${tag} draft v2`, `${r._s}`)
  r = await api(`/api/announcements/${draftId}`, { method: 'DELETE', token: staff.token })
  check('and deleted (204)', r._s === 204, `${r._s}`)

  console.log('\n--- send now, and the email side ---')
  await clearCapturedEmails()
  r = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} everyone`, body: 'A notice for everyone.', sendNow: true }
  })
  const everyoneId = r._b?.announcement?.id
  if (r._s === 201) made.announcementIds.push(everyoneId)
  check('sending now reports who it reached (201)', r._s === 201 && (r._b?.dispatch?.sent ?? 0) >= 4, `${r._s} ${JSON.stringify(r._b?.dispatch)}`)
  const mails = await capturedEmails()
  // D-08: an announcement is an inbox event by default. Email is opted into per
  // send, so this one must not have mailed anybody.
  check('and by default it did not email anyone', mails.filter(m => m.to === insideA.email).length === 0, `${mails.filter(m => m.to === insideA.email).length} mails`)

  // The explicit opt-in does email, subject to the quota and to preferences.
  // BC-12 refuses a send when the day's budget cannot be read. That is correct
  // but not what this suite tests, so retry only that refusal; a genuine
  // over-budget answer still fails the check below.
  const budgetUnreadable = (res: Awaited<ReturnType<typeof api>>) =>
    res._s === 409 && /could not be checked/i.test(String((res._b as { error?: string } | null)?.error ?? ''))
  const sendOptIn = async (body: Record<string, unknown>) => {
    let res = await api('/api/announcements', { method: 'POST', token: staff.token, body })
    for (let attempt = 0; attempt < 2 && budgetUnreadable(res); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      res = await api('/api/announcements', { method: 'POST', token: staff.token, body })
    }
    return res
  }

  const emailOpt = await sendOptIn({ title: `${tag} by mail`, body: 'This one goes to email too.', sendNow: true, sendEmail: true })
  if (emailOpt._s === 201) made.announcementIds.push(emailOpt._b?.announcement?.id)
  check('an explicit email opt-in mails the audience (201)', emailOpt._s === 201 && (emailOpt._b?.dispatch?.emails ?? 0) >= 4, `${emailOpt._s} ${JSON.stringify(emailOpt._b?.dispatch)}`)
  const optedMails = await capturedEmails()
  check('and the mail went out', optedMails.filter(m => m.to === insideA.email).length === 1, `${optedMails.filter(m => m.to === insideA.email).length}`)

  // Unsubscribing from email is honoured (the other half of the acceptance).
  await api('/api/notifications/preferences', { method: 'PUT', token: outside.token, body: { email: false } })
  await clearCapturedEmails()
  r = await sendOptIn({ title: `${tag} quiet please`, body: 'Another notice.', sendNow: true, sendEmail: true })
  if (r._s === 201) made.announcementIds.push(r._b?.announcement?.id)
  const afterOptOut = await capturedEmails()
  check('an unsubscribed student is not mailed', afterOptOut.filter(m => m.to === outside.email).length === 0, `${afterOptOut.filter(m => m.to === outside.email).length}`)
  check('but still hears it in the app', (await notesFor(outside.id)).length >= 1, `${(await notesFor(outside.id)).length}`)
  check('while everyone else was mailed', afterOptOut.filter(m => m.to === insideA.email).length === 1, `${afterOptOut.filter(m => m.to === insideA.email).length}`)

  console.log('\n--- the body cannot smuggle a script ---')
  await clearCapturedEmails()
  r = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} sneaky`, body: '<script>alert(1)</script> plus [click](javascript:alert(2))', sendNow: true }
  })
  if (r._s === 201) made.announcementIds.push(r._b?.announcement?.id)
  const list = await api('/api/announcements', { token: staff.token })
  const sneaky = (list._b?.items ?? []).find((item: { title: string }) => item.title === `${tag} sneaky`)
  check('the rendered preview contains no script', !!sneaky && !sneaky.preview.includes('<script') && !/<a\s/i.test(sneaky.preview), `${sneaky?.preview?.slice(0, 80)}`)
  check('the escaped text is shown as text', !!sneaky && sneaky.preview.includes('&lt;script&gt;'), `${sneaky?.preview?.slice(0, 80)}`)

  console.log('\n--- pinned, for everyone ---')
  const pinned = await api('/api/announcements/pinned', { token: student.token })
  check('a student can read the pinned list (200)', pinned._s === 200, `${pinned._s}`)
  check('the unpinned announcement is not in it', !(pinned._b?.items ?? []).some((item: { title: string }) => item.title === `${tag} college assembly`), JSON.stringify((pinned._b?.items ?? []).map((i: { title: string }) => i.title)))

  await api(`/api/announcements/${everyoneId}`, { method: 'PUT', token: staff.token, body: { pinned: true } })
  const pinnedAfter = await api('/api/announcements/pinned', { token: student.token })
  check('pinning a sent one puts it in front of everyone', (pinnedAfter._b?.items ?? []).some((item: { title: string }) => item.title === `${tag} everyone`), JSON.stringify((pinnedAfter._b?.items ?? []).map((i: { title: string }) => i.title)))

  r = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} pinned draft`, body: 'Not for anyone yet.', pinned: true }
  })
  if (r._s === 201) made.announcementIds.push(r._b?.announcement?.id)
  const pinnedDraft = await api('/api/announcements/pinned', { token: student.token })
  check('a pinned draft stays private', !(pinnedDraft._b?.items ?? []).some((item: { title: string }) => item.title === `${tag} pinned draft`), JSON.stringify((pinnedDraft._b?.items ?? []).map((i: { title: string }) => i.title)))

  console.log('\n--- an email send over the daily budget is refused (BC-12) ---')
  // Spend the rest of today's counter with throwaway rows, so the refusal is
  // exercised through the real guard rather than a mock.
  const quotaTag = `${tag}-quota`
  const limit = dailyLimit()
  const usedToday = await prisma.emailSend.count({ where: { createdAt: { gte: utcDayStart() } } })
  const rowsNeeded = Math.max(1, limit - usedToday + 1)
  if (rowsNeeded > 1000) {
    check('the configured daily limit is testable', false, `RESEND_DAILY_LIMIT=${limit} would need ${rowsNeeded} rows`)
  } else {
    await prisma.emailSend.createMany({
      data: Array.from({ length: rowsNeeded }, () => ({ kind: quotaTag, createdAt: new Date() }))
    })
  }

  r = await api(`/api/announcements/preview?audienceType=college&audienceCollegeId=${collegeA.id}`, { token: staff.token })
  check('the preview reports the budget is spent', r._s === 200 && r._b?.quota?.remaining === 0 && r._b?.budget?.state === 'over_budget', `${r._s} ${JSON.stringify(r._b?.quota)} ${JSON.stringify(r._b?.budget)}`)

  const beforeRefusal = (await notesFor(insideA.id)).length
  await clearCapturedEmails()
  r = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} too many`,
      body: 'This one asks for more email than the day has left.',
      audienceType: 'college',
      audienceCollegeId: collegeA.id,
      sendNow: true,
      sendEmail: true
    }
  })
  check('an email send over the budget is refused (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)
  if (r._s === 201) made.announcementIds.push(r._b?.announcement?.id)
  check('the refusal names the audience and the remaining budget', typeof r._b?.error === 'string' && r._b.error.includes('2 people') && r._b.error.includes('0 of today\'s'), String(r._b?.error))
  check('nothing was written as an announcement', (await prisma.announcement.count({ where: { title: `${tag} too many` } })) === 0)
  check('nobody was notified and no mail went out', (await notesFor(insideA.id)).length === beforeRefusal && (await capturedEmails()).filter(m => m.to === insideA.email).length === 0)
  const refusalAudit = await prisma.auditLog.findFirst({
    where: { action: 'announcement_email_refused', performedBy: staff.id },
    orderBy: { createdAt: 'desc' }
  })
  check('the refusal is recorded with its numbers', !!refusalAudit && (refusalAudit.details ?? '').includes('"recipients":2') && (refusalAudit.details ?? '').includes('"remaining":0'), String(refusalAudit?.details))

  // The other send path — sending a saved draft now — must refuse the same way
  // and leave the draft untouched.
  const savedDraft = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} too many draft`,
      body: 'Saved now, but it asks for more email than the day has left.',
      audienceType: 'college',
      audienceCollegeId: collegeA.id
    }
  })
  const savedDraftId = savedDraft._b?.announcement?.id
  if (savedDraft._s === 201) made.announcementIds.push(savedDraftId)
  check('a draft for the over-budget check is saved (201)', savedDraft._s === 201 && savedDraft._b?.announcement?.status === 'draft', `${savedDraft._s}`)
  r = await api(`/api/announcements/${savedDraftId}/send`, { method: 'POST', token: staff.token, body: { sendEmail: true } })
  check('sending a saved draft by email over budget is refused too (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)
  check('and the draft stays a draft', !!savedDraftId && (await prisma.announcement.findUnique({ where: { id: savedDraftId } }))?.status === 'draft')

  r = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: {
      title: `${tag} inbox only`,
      body: 'The inbox still works when the email budget is spent.',
      audienceType: 'college',
      audienceCollegeId: collegeA.id,
      sendNow: true
    }
  })
  if (r._s === 201) made.announcementIds.push(r._b?.announcement?.id)
  check('an inbox-only send is unaffected (201, 2 reached)', r._s === 201 && r._b?.dispatch?.recipients === 2, `${r._s} ${JSON.stringify(r._b?.dispatch)}`)
  check('and it mailed nobody', (await capturedEmails()).filter(m => m.to === insideA.email).length === 0)

  await prisma.emailSend.deleteMany({ where: { kind: quotaTag } })
  r = await api(`/api/announcements/preview?audienceType=college&audienceCollegeId=${collegeA.id}`, { token: staff.token })
  check('the counter returns once the test rows are gone', r._s === 200 && r._b?.quota?.known === true && r._b?.quota?.remaining > 0, `${r._s} ${JSON.stringify(r._b?.quota)}`)

  console.log('\n--- an audience in use protects the college ---')
  r = await api('/api/reference/colleges', { method: 'DELETE', token: manager.token, body: { id: collegeA.id } })
  check('the college an announcement targets cannot be deleted (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  await prisma.emailSend.deleteMany({ where: { kind: { startsWith: `${tag}-quota` } } }).catch(() => {})
  for (const id of made.announcementIds) {
    await prisma.notification.deleteMany({ where: { dedupeKey: { contains: id } } })
    await prisma.announcement.delete({ where: { id } }).catch(() => {})
  }
  await prisma.announcement.deleteMany({ where: { title: { startsWith: tag } } })
  for (const id of made.sectionIds) {
    await prisma.section.delete({ where: { id } }).catch(() => {})
  }
  if (made.userIds.length) {
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: made.userIds } }, { createdBy: { in: made.userIds } }] } })
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: made.userIds } } })
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
