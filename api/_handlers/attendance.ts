import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, forbidStudents } from '../_lib/auth.js'
import {
  badRequest,
  forbidden,
  handle,
  isUniqueViolation,
  notFound,
} from '../_lib/http.js'
import {
  authorizeDutySelfCheckIn,
  authorizeEventSelfCheckIn,
  authorizeManualCheckIn,
} from '../_lib/attendance-rules.js'
import { auditDelegationUse, requireEventScope } from '../_lib/delegation.js'
import { issueQrToken, verifyQrToken } from '../_lib/qr.js'
import { signatureRef } from '../_lib/signature.js'
import { buildReport, fileStem, formatManila, parseFormat, type ReportModel } from '../_lib/report.js'
import { manilaDayRange, manilaDow, manilaHHMM } from '../_lib/time.js'

const ALREADY_CHECKED_IN = 'Already checked in. Check out before checking in again.'

// ---------------------------------------------------------------------------
// GET/POST /api/attendance
// ---------------------------------------------------------------------------
export const index = handle(async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticate(req)

  if (req.method === 'GET') {
    const eventId = req.query.eventId as string
    if (!eventId) {
      throw badRequest('eventId query parameter is required')
    }
    await requireEventScope(prisma, user, eventId, 'view_roster')

    const records = await prisma.attendance.findMany({
      where: { eventId },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } },
        recorder: { select: { id: true, name: true, position: true } },
        signature: { select: { signedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return res.status(200).json(records)
  }

  if (req.method === 'POST') {
    const { type, eventId, dutyDate, userId, method, lat, lng } = req.body

    if (!userId || !method) {
      throw badRequest('Missing required fields')
    }

    const attendanceType = type || 'event'

    // Students are checked in by an officer scanning their QR - never by themselves.
    if (method === 'self' && user.role === 'student') {
      throw forbidden('Students are checked in by an officer. Show your QR code at the venue.')
    }

    if (attendanceType === 'event' && !eventId) {
      throw badRequest('eventId is required for event check-ins')
    }

    if (attendanceType === 'duty' && !dutyDate) {
      throw badRequest('dutyDate is required for duty check-ins')
    }

    if (method !== 'self' && method !== 'manual') {
      throw badRequest("method must be 'self' or 'manual'. QR check-ins go through /api/attendance/qr with a signed token.")
    }

    // Resolve who may record whom, how, and where — all server-side.
    let resolved: { lat: number | null; lng: number | null }
    let delegatedScope: 'manual_checkin' | null = null
    if (method === 'self') {
      if (attendanceType === 'event') {
        const event = await prisma.event.findUnique({ where: { id: eventId } })
        if (!event) {
          throw notFound('Event not found')
        }
        resolved = authorizeEventSelfCheckIn({
          actor: user,
          targetUserId: userId,
          lat,
          lng,
          geofence: event,
        })
      } else {
        resolved = authorizeDutySelfCheckIn({ actor: user, targetUserId: userId, lat, lng })
      }
    } else {
      if (attendanceType === 'event') {
        // Staff, or an officer holding an active "manual_checkin" grant for this event.
        const { viaDelegation } = await requireEventScope(prisma, user, eventId, 'manual_checkin')
        if (userId === user.id) {
          throw forbidden('You cannot manually record your own attendance.')
        }
        delegatedScope = viaDelegation ? 'manual_checkin' : null
      } else {
        authorizeManualCheckIn(user, userId)
      }
      resolved = { lat: null, lng: null }
    }

    // Check for open (not-yet-checked-out) record
    if (attendanceType === 'event') {
      const existing = await prisma.attendance.findFirst({
        where: { eventId, userId, checkOutAt: null },
      })
      if (existing) {
        throw forbidden(ALREADY_CHECKED_IN)
      }
    } else {
      const { gte, lt } = manilaDayRange(new Date(dutyDate))
      const existing = await prisma.attendance.findFirst({
        where: {
          userId,
          type: 'duty',
          dutyDate: { gte, lt },
          checkOutAt: null,
        },
      })
      if (existing) {
        throw forbidden(ALREADY_CHECKED_IN)
      }
    }

    try {
      const record = await prisma.attendance.create({
        data: {
          type: attendanceType,
          eventId: attendanceType === 'event' ? eventId : null,
          dutyDate: attendanceType === 'duty' ? new Date(dutyDate) : null,
          userId,
          method,
          lat: resolved.lat,
          lng: resolved.lng,
          recordedBy: user.id,
        },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
        },
      })

      if (delegatedScope) {
        await auditDelegationUse(prisma, user, eventId, delegatedScope, {
          attendanceId: record.id,
          targetUserId: userId,
        })
      }

      return res.status(201).json(record)
    } catch (dbErr: unknown) {
      // P2002 = unique constraint violation (race fallback from partial unique index)
      if (isUniqueViolation(dbErr)) {
        throw forbidden(ALREADY_CHECKED_IN)
      }
      throw dbErr
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
})

// ---------------------------------------------------------------------------
// POST /api/attendance/checkout
// ---------------------------------------------------------------------------
export const checkout = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await authenticate(req)
  const { eventId, dutyDate, userId } = req.body

  if (!userId) {
    throw badRequest('userId is required')
  }

  if (!eventId && !dutyDate) {
    throw badRequest('Either eventId or dutyDate is required')
  }

  // Determine self-checkout vs manual checkout
  const isSelf = user.id === userId
  if (isSelf) forbidStudents(user)
  let delegatedCheckout = false
  if (!isSelf) {
    if (eventId) {
      // Staff, or an officer holding an active "manual_checkin" grant for this event.
      const { viaDelegation } = await requireEventScope(prisma, user, eventId, 'manual_checkin')
      delegatedCheckout = viaDelegation
    } else {
      // Duty check-out for someone else stays staff-only (throws 403)
      authorizeManualCheckIn(user, userId)
    }
  }

  // Find the open record
  let openRecord
  if (eventId) {
    openRecord = await prisma.attendance.findFirst({
      where: { eventId, userId, checkOutAt: null },
    })
  } else {
    const { gte, lt } = manilaDayRange(new Date(dutyDate))
    openRecord = await prisma.attendance.findFirst({
      where: {
        userId,
        type: 'duty',
        dutyDate: { gte, lt },
        checkOutAt: null,
      },
    })
  }

  if (!openRecord) {
    throw notFound('No open check-in record found. You may have already checked out.')
  }

  // Time-window enforcement for duty checkout only
  if (!eventId && dutyDate) {
    let orgProfile = await prisma.orgProfile.findFirst()
    if (!orgProfile) {
      orgProfile = await prisma.orgProfile.create({ data: {} })
    }

    const nowManila = manilaHHMM(new Date())
    if (nowManila < orgProfile.dutyCheckOutStart) {
      throw forbidden(`Duty check-out is only allowed starting ${orgProfile.dutyCheckOutStart}.`)
    }
  }

  // Set checkOutAt
  const updated = await prisma.attendance.update({
    where: { id: openRecord.id },
    data: { checkOutAt: new Date() },
    include: {
      user: { select: { id: true, name: true, position: true, role: true } },
    },
  })

  if (delegatedCheckout && eventId) {
    await auditDelegationUse(prisma, user, eventId, 'manual_checkin', {
      attendanceId: updated.id,
      targetUserId: userId,
      action: 'checkout',
    })
  }

  return res.status(200).json(updated)
})

// ---------------------------------------------------------------------------
// GET/POST /api/attendance/duty
// ---------------------------------------------------------------------------
export const duty = handle(async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticate(req)

  // GET: list duty check-ins for a date
  if (req.method === 'GET') {
    const dateStr = req.query.date as string
    const date = dateStr ? new Date(dateStr) : new Date()
    const dayOfWeek = manilaDow(date)

    const duties = await prisma.officeDuty.findMany({
      where: { dayOfWeek, active: true },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } },
      },
    })

    // Get attendance records for that Manila day
    const { gte, lt } = manilaDayRange(date)
    const attendance = await prisma.attendance.findMany({
      where: {
        type: 'duty',
        dutyDate: { gte, lt },
      },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } },
        recorder: { select: { id: true, name: true, position: true } },
      },
    })

    return res.status(200).json({ duties, attendance })
  }

  // POST: check in for duty
  if (req.method === 'POST') {
    const { userId, lat, lng, dutyDate } = req.body

    if (!userId) {
      throw badRequest('userId is required')
    }

    const date = dutyDate ? new Date(dutyDate) : new Date()
    const dayOfWeek = manilaDow(date)

    // Verify officer has duty on that Manila day
    const dutyRecord = await prisma.officeDuty.findFirst({
      where: { userId, dayOfWeek, active: true },
    })

    if (!dutyRecord) {
      throw forbidden('No duty scheduled for today')
    }

    // Time-window enforcement: duty check-in cutoff (Manila wall clock)
    let orgProfile = await prisma.orgProfile.findFirst()
    if (!orgProfile) {
      orgProfile = await prisma.orgProfile.create({ data: {} })
    }

    const nowManila = manilaHHMM(new Date())
    if (nowManila >= orgProfile.dutyCheckInCutoff) {
      throw forbidden(`Duty check-in is only allowed before ${orgProfile.dutyCheckInCutoff}.`)
    }

    // Check for open (not-yet-checked-out) duty record that Manila day
    const { gte, lt } = manilaDayRange(date)
    const existing = await prisma.attendance.findFirst({
      where: {
        userId,
        type: 'duty',
        dutyDate: { gte, lt },
        checkOutAt: null,
      },
    })
    if (existing) {
      throw forbidden(ALREADY_CHECKED_IN)
    }

    // Who may record whom: self check-in is open; recording someone else is staff-only.
    // recordedBy is always the authenticated user, never from the body.
    let resolved: { lat: number | null; lng: number | null }
    let method: 'self' | 'manual'
    if (userId === user.id) {
      method = 'self'
      resolved = authorizeDutySelfCheckIn({ actor: user, targetUserId: userId, lat, lng })
    } else {
      method = 'manual'
      authorizeManualCheckIn(user, userId)
      resolved = { lat: null, lng: null }
    }

    try {
      const record = await prisma.attendance.create({
        data: {
          type: 'duty',
          dutyDate: date,
          userId,
          method,
          lat: resolved.lat,
          lng: resolved.lng,
          recordedBy: user.id,
        },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
        },
      })

      return res.status(201).json(record)
    } catch (dbErr: unknown) {
      if (isUniqueViolation(dbErr)) {
        throw forbidden(ALREADY_CHECKED_IN)
      }
      throw dbErr
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
})

// ---------------------------------------------------------------------------
// GET /api/attendance/export?eventId=&format=csv|xlsx|pdf   (default csv)
// ---------------------------------------------------------------------------
export const exportAttendance = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await authenticate(req)

  const eventId = req.query.eventId as string
  if (!eventId) {
    throw badRequest('eventId is required')
  }

  const { viaDelegation } = await requireEventScope(prisma, user, eventId, 'export')

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) {
    throw notFound('Event not found')
  }
  if (viaDelegation) {
    await auditDelegationUse(prisma, user, eventId, 'export')
  }

  const format = parseFormat(req.query.format)
  if (!format) {
    throw badRequest('format must be one of: csv, xlsx, pdf')
  }

  const records = await prisma.attendance.findMany({
    where: { eventId },
    include: {
      user: { select: { name: true, position: true } },
      recorder: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const sigs = await prisma.attendanceSignature.findMany({
    where: { attendanceId: { in: records.map((r) => r.id) } },
    select: { attendanceId: true, png: true, sha256: true },
  })
  const sigById = new Map(sigs.map((s) => [s.attendanceId, s]))

  const METHOD_LABEL: Record<string, string> = { self: 'Self', qr: 'QR', manual: 'Manual' }
  const model: ReportModel = {
    title: event.title,
    eventDate: formatManila(event.date).slice(0, 10),
    venue: `${event.lat.toFixed(5)}, ${event.lng.toFixed(5)} (${event.radiusMeters} m radius)`,
    generatedAt: formatManila(new Date()),
    generatedBy: user.name,
    rows: records.map((r, i) => ({
      no: i + 1,
      name: r.user.name,
      position: r.user.position,
      timeIn: formatManila(r.createdAt),
      timeOut: r.checkOutAt ? formatManila(r.checkOutAt) : '',
      method: METHOD_LABEL[r.method] ?? r.method,
      recordedBy: r.recorder.name,
      location: r.lat != null && r.lng != null ? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}` : '',
      signatureRef: sigById.has(r.id) ? signatureRef(sigById.get(r.id)!.sha256) : null,
      signaturePng: sigById.has(r.id) ? new Uint8Array(sigById.get(r.id)!.png) : null,
    })),
  }

  const report = await buildReport(model, format)

  res.setHeader('Content-Type', report.contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${fileStem(event.title)}.${report.extension}"`)
  res.setHeader('Cache-Control', 'no-store')

  return res.status(200).send(report.body)
})

// ---------------------------------------------------------------------------
// POST /api/attendance/qr-token  — issue a server-signed QR token (own account)
// ---------------------------------------------------------------------------
export const qrToken = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await authenticate(req)
  const { eventId } = req.body

  if (!eventId || typeof eventId !== 'string') {
    throw badRequest('eventId is required')
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) {
    throw notFound('Event not found')
  }

  const { token, exp } = issueQrToken(user.id, eventId)
  return res.status(200).json({ token, exp })
})

// ---------------------------------------------------------------------------
// POST /api/attendance/qr  — scan a server-signed token
// ---------------------------------------------------------------------------
export const qr = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await authenticate(req)
  const { token } = req.body

  if (!token || typeof token !== 'string') {
    throw badRequest('token is required')
  }

  // The scanner must be staff or hold an active "scan" grant for this event,
  // and cannot scan their own code.
  const payload = verifyQrToken(token)
  const { viaDelegation } = await requireEventScope(prisma, user, payload.e, 'scan')
  if (payload.u === user.id) {
    throw forbidden('You cannot check in with your own QR code')
  }

  // Check for open (not-yet-checked-out) record
  const existing = await prisma.attendance.findFirst({
    where: { eventId: payload.e, userId: payload.u, checkOutAt: null },
  })
  if (existing) {
    throw forbidden(ALREADY_CHECKED_IN)
  }

  try {
    const record = await prisma.attendance.create({
      data: {
        type: 'event',
        eventId: payload.e,
        userId: payload.u,
        method: 'qr',
        recordedBy: user.id,
      },
      include: {
        user: { select: { id: true, name: true, position: true, role: true } },
      },
    })

    if (viaDelegation) {
      await auditDelegationUse(prisma, user, payload.e, 'scan', {
        attendanceId: record.id,
        targetUserId: payload.u,
      })
    }

    return res.status(201).json(record)
  } catch (dbErr: unknown) {
    if (isUniqueViolation(dbErr)) {
      throw forbidden(ALREADY_CHECKED_IN)
    }
    throw dbErr
  }
})
