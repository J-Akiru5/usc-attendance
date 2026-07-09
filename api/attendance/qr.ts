import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'
import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.QR_SECRET || 'usc-attendance-qr-secret-change-in-prod'

function sign(userId: string, eventId: string, issuedAt: number): string {
  const data = `${userId}:${eventId}:${issuedAt}`
  return createHmac('sha256', SECRET).update(data).digest('hex')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    if (req.method === 'POST') {
      const { userId, eventId, recordedBy } = req.body

      if (!userId || !eventId || !recordedBy) {
        return res.status(400).json({ error: 'Missing required fields: userId, eventId, recordedBy' })
      }

      // Get the QR token from the request body
      const { issuedAt, exp, sig } = req.body

      if (!issuedAt || !exp || !sig) {
        return res.status(400).json({ error: 'Missing QR token fields' })
      }

      // Verify signature
      const expectedSig = sign(userId, eventId, issuedAt)
      const expectedBuf = Buffer.from(expectedSig, 'hex')
      const actualBuf = Buffer.from(sig, 'hex')

      if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
        return res.status(403).json({ error: 'Invalid QR code signature' })
      }

      // Verify expiry
      const now = Math.floor(Date.now() / 1000)
      if (now > exp) {
        return res.status(403).json({ error: 'QR code has expired' })
      }

      // Check for open (not-yet-checked-out) record
      const existing = await prisma.attendance.findFirst({
        where: { eventId, userId, checkOutAt: null },
      })

      if (existing) {
        return res.status(409).json({ error: 'Already checked in. Check out before checking in again.' })
      }

      // QR scan requires staff
      requireStaff(user)

      try {
        const record = await prisma.attendance.create({
          data: {
            type: 'event',
            eventId,
            userId,
            method: 'qr',
            recordedBy,
          },
          include: {
            user: { select: { id: true, name: true, position: true, role: true } },
          },
        })

        return res.status(201).json(record)
      } catch (dbErr: unknown) {
        if (dbErr && typeof dbErr === 'object' && 'code' in dbErr && (dbErr as { code: string }).code === 'P2002') {
          return res.status(409).json({ error: 'Already checked in. Check out before checking in again.' })
        }
        throw dbErr
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
