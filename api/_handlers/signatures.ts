import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate } from '../_lib/auth.js'
import { badRequest, handle, HttpError, isUniqueViolation, notFound } from '../_lib/http.js'
import { SIGN_WINDOW_MS, signatureRef, validateSignature } from '../_lib/signature.js'

// ---------------------------------------------------------------------------
// GET /api/attendance/pending-signature
// Event check-ins of the signed-in person that still need their signature.
// ---------------------------------------------------------------------------
export const pendingSignature = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const user = await authenticate(req)

  const records = await prisma.attendance.findMany({
    where: {
      userId: user.id,
      type: 'event',
      createdAt: { gt: new Date(Date.now() - SIGN_WINDOW_MS) },
      signature: { is: null },
    },
    select: { id: true, eventId: true, createdAt: true, event: { select: { title: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return res.status(200).json(
    records.map((r) => ({ id: r.id, eventId: r.eventId, eventTitle: r.event?.title ?? '', createdAt: r.createdAt }))
  )
})

// ---------------------------------------------------------------------------
// POST /api/attendance/sign   { attendanceId, signature: "data:image/png;base64,..." }
// You can only sign your own attendance record, once, within the signing window.
// ---------------------------------------------------------------------------
export const sign = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await authenticate(req)

  const { attendanceId, signature } = req.body ?? {}
  if (typeof attendanceId !== 'string' || !attendanceId) {
    throw badRequest('attendanceId is required')
  }

  const record = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { signature: { select: { attendanceId: true } } },
  })
  // Same answer for "does not exist" and "is somebody else's".
  if (!record || record.userId !== user.id) throw notFound('Attendance record not found')
  if (record.signature) throw new HttpError(409, 'This attendance is already signed')
  if (Date.now() - record.createdAt.getTime() > SIGN_WINDOW_MS) {
    throw new HttpError(403, 'The signing window for this check-in has closed. Please ask an officer.')
  }

  const { png, sha256 } = await validateSignature(signature)

  try {
    const saved = await prisma.attendanceSignature.create({
      data: { attendanceId, png: new Uint8Array(png), sha256 },
      select: { signedAt: true },
    })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'attendance_signed',
        details: JSON.stringify({ attendanceId, sha256 }),
        performedBy: user.id,
      },
    })
    return res.status(201).json({ signedAt: saved.signedAt, ref: signatureRef(sha256) })
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'This attendance is already signed')
    throw err
  }
})
