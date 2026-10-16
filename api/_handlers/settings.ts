import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'crypto'
import { prisma } from '../_lib/prisma.js'
import { authenticate } from '../_lib/auth.js'
import { badRequest, handle, HttpError, notFound } from '../_lib/http.js'
import { parseRetention, parseWindow, requireSettingsManager, validateSemester } from '../_lib/retention.js'
import { getSettings, runSignaturePurge } from '../_lib/purge.js'

// ---------------------------------------------------------------------------
// GET/PUT /api/settings/retention   — settings managers only
// ---------------------------------------------------------------------------
export const retention = handle(async (req: VercelRequest, res: VercelResponse) => {
  const actor = await authenticate(req)
  requireSettingsManager(actor)

  if (req.method === 'GET') {
    const [settings, semesters] = await Promise.all([
      getSettings(prisma),
      prisma.semester.findMany({ orderBy: { startsOn: 'asc' } }),
    ])
    const live = await prisma.attendanceSignature.count({ where: { purgedAt: null } })
    const inSemester =
      semesters.length === 0
        ? 0
        : await prisma.attendanceSignature.count({
            where: { purgedAt: null, OR: semesters.map((s) => ({ signedAt: { gte: s.startsOn, lt: s.endsOn } })) },
          })
    return res.status(200).json({
      signatureRetentionSemesters: settings.signatureRetentionSemesters,
      purgeGraceDays: settings.purgeGraceDays,
      lastPurgeAt: settings.lastPurgeAt,
      lastPurgeCount: settings.lastPurgeCount,
      semesters,
      liveSignatures: live,
      unassignedSignatures: live - inSemester,
    })
  }

  if (req.method === 'PUT') {
    const input = parseRetention(req.body)
    const settings = await getSettings(prisma)
    const updated = await prisma.settings.update({ where: { id: settings.id }, data: input })
    await prisma.auditLog.create({
      data: { userId: null, action: 'retention_changed', details: JSON.stringify(input), performedBy: actor.id },
    })
    return res.status(200).json({
      signatureRetentionSemesters: updated.signatureRetentionSemesters,
      purgeGraceDays: updated.purgeGraceDays,
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
})

// ---------------------------------------------------------------------------
// POST /api/semesters            — define a semester (settings managers)
// DELETE /api/semesters/:id
// ---------------------------------------------------------------------------
export const semesters = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const actor = await authenticate(req)
  requireSettingsManager(actor)

  const existing = await prisma.semester.findMany()
  const data = validateSemester(req.body ?? {}, existing)
  const created = await prisma.semester.create({ data: { name: data.name, startsOn: data.startsOn, endsOn: data.endsOn } })
  await prisma.auditLog.create({
    data: { userId: null, action: 'semester_added', details: JSON.stringify({ id: created.id, name: created.name }), performedBy: actor.id },
  })
  return res.status(201).json(created)
})

export const semesterById = handle(async (req: VercelRequest, res: VercelResponse, id: string) => {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })
  const actor = await authenticate(req)
  requireSettingsManager(actor)

  const sem = await prisma.semester.findUnique({ where: { id } })
  if (!sem) throw notFound('Semester not found')
  await prisma.semester.delete({ where: { id } })
  await prisma.auditLog.create({
    data: { userId: null, action: 'semester_removed', details: JSON.stringify({ id, name: sem.name }), performedBy: actor.id },
  })
  return res.status(204).end()
})

// ---------------------------------------------------------------------------
// POST /api/settings/purge-signatures — run the retention purge now (settings managers)
// ---------------------------------------------------------------------------
export const purgeNow = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const actor = await authenticate(req)
  requireSettingsManager(actor)
  return res.status(200).json(await runSignaturePurge(prisma, actor.id))
})

// ---------------------------------------------------------------------------
// GET /api/cron/purge-signatures — called daily by Vercel Cron with CRON_SECRET
// ---------------------------------------------------------------------------
export const cronPurge = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const secret = process.env.CRON_SECRET
  if (!secret) throw new HttpError(503, 'CRON_SECRET is not configured')

  const given = Buffer.from(String(req.headers.authorization ?? ''))
  const want = Buffer.from(`Bearer ${secret}`)
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new HttpError(401, 'Unauthorized')
  }
  return res.status(200).json(await runSignaturePurge(prisma, null))
})

// ---------------------------------------------------------------------------
// PUT /api/events/:id/window   { checkInOpensAt, checkInClosesAt }  (null/'' clears)
// ---------------------------------------------------------------------------
export const eventWindow = handle(async (req: VercelRequest, res: VercelResponse, id: string) => {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' })
  const actor = await authenticate(req)
  requireSettingsManager(actor)

  const event = await prisma.event.findUnique({ where: { id } })
  if (!event) throw notFound('Event not found')
  if (req.body === undefined || req.body === null) throw badRequest('Request body is required')

  const data = parseWindow(req.body)
  const updated = await prisma.event.update({
    where: { id },
    data,
    select: { id: true, checkInOpensAt: true, checkInClosesAt: true },
  })
  await prisma.auditLog.create({
    data: {
      userId: null,
      action: 'checkin_window_set',
      details: JSON.stringify({ eventId: id, opens: data.checkInOpensAt, closes: data.checkInClosesAt }),
      performedBy: actor.id,
    },
  })
  return res.status(200).json(updated)
})
