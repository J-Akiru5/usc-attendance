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

const made: { userIds: string[], announcementIds: string[] } = { userIds: [], announcementIds: [] }

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
  const colleges = (academic._b?.colleges ?? []) as Array<{ id: string, code: string, name: string }>
  const collegeA = colleges[0]!
  const collegeB = colleges.find(c => c.id !== collegeA.id)

  // Two students inside collegeA, one outside it.
  const insideA = await mkUser('insidea', { role: 'student' })
  const insideB = await mkUser('insideb', { role: 'student' })
  const outside = await mkUser('outside', { role: 'student' })
  await prisma.studentProfile.create({ data: { userId: insideA.id, studentNo: `${tag.slice(-7)}1`, collegeId: collegeA.id, yearLevel: 2 } })
  await prisma.studentProfile.create({ data: { userId: insideB.id, studentNo: `${tag.slice(-7)}2`, collegeId: collegeA.id, yearLevel: 3 } })
  await prisma.studentProfile.create({ data: { userId: outside.id, studentNo: `${tag.slice(-7)}3`, collegeId: collegeB?.id ?? null, yearLevel: 2 } })

  const notesFor = (userId: string) => prisma.notification.findMany({ where: { userId, kind: 'announcement' }, orderBy: { createdAt: 'desc' } })

  console.log('\n--- writing one ---')
  let r = await api('/api/announcements', { token: student.token })
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
  check('and the mail went out', mails.filter(m => m.to === insideA.email).length === 1, `${mails.filter(m => m.to === insideA.email).length}`)

  // Unsubscribing from email is honoured (the other half of the acceptance).
  await api('/api/notifications/preferences', { method: 'PUT', token: outside.token, body: { email: false } })
  await clearCapturedEmails()
  r = await api('/api/announcements', {
    method: 'POST',
    token: staff.token,
    body: { title: `${tag} quiet please`, body: 'Another notice.', sendNow: true }
  })
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
  check('the rendered preview contains no script', !!sneaky && !sneaky.preview.includes('<script') && !sneaky.preview.includes('javascript:'), `${sneaky?.preview?.slice(0, 80)}`)
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

  console.log('\n--- an audience in use protects the college ---')
  r = await api('/api/reference/colleges', { method: 'DELETE', token: manager.token, body: { id: collegeA.id } })
  check('the college an announcement targets cannot be deleted (409)', r._s === 409, `${r._s} ${JSON.stringify(r._b)}`)
}

async function cleanup() {
  console.log('\nCleaning up throwaway data...')
  for (const id of made.announcementIds) {
    await prisma.notification.deleteMany({ where: { dedupeKey: { contains: id } } })
    await prisma.announcement.delete({ where: { id } }).catch(() => {})
  }
  await prisma.announcement.deleteMany({ where: { title: { startsWith: tag } } })
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
