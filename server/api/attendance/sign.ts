import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { SIGN_WINDOW_MS, signatureRef, validateSignature } from '../../utils/signature'

// ---------------------------------------------------------------------------
// POST /api/attendance/sign   { attendanceId, signature: "data:image/png;base64,..." }
// You can only sign your own attendance record, once, within the signing window.
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })
  const user = await authenticate(event)

  const { attendanceId, signature } = await readJsonBody(event) ?? {}
  if (typeof attendanceId !== 'string' || !attendanceId) {
    throw badRequest('attendanceId is required')
  }

  const record = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { signature: { select: { attendanceId: true } } }
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
      select: { signedAt: true }
    })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'attendance_signed',
        details: JSON.stringify({ attendanceId, sha256 }),
        performedBy: user.id
      }
    })
    return respond(event, 201, { signedAt: saved.signedAt, ref: signatureRef(sha256) })
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'This attendance is already signed')
    throw err
  }
})
