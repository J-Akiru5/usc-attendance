import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'

function manilaHHMM(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hh}:${mm}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    // GET: list duty check-ins for a date
    if (req.method === 'GET') {
      const dateStr = req.query.date as string
      const date = dateStr ? new Date(dateStr) : new Date()
      const dayOfWeek = date.getDay()

      const duties = await prisma.officeDuty.findMany({
        where: { dayOfWeek, active: true },
        include: {
          user: { select: { id: true, name: true, position: true, role: true } },
        },
      })

      // Get attendance records for today's duty
      const todayStart = new Date(date)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(date)
      todayEnd.setHours(23, 59, 59, 999)

      const attendance = await prisma.attendance.findMany({
        where: {
          type: 'duty',
          dutyDate: { gte: todayStart, lte: todayEnd },
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
      const { userId, lat, lng, recordedBy, dutyDate } = req.body

      if (!userId || !recordedBy) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      const date = dutyDate ? new Date(dutyDate) : new Date()
      const dayOfWeek = date.getDay()

      // Verify officer has duty today
      const duty = await prisma.officeDuty.findFirst({
        where: { userId, dayOfWeek, active: true },
      })

      if (!duty) {
        return res.status(403).json({ error: 'No duty scheduled for today' })
      }

      // Time-window enforcement: duty check-in cutoff
      let orgProfile = await prisma.orgProfile.findFirst()
      if (!orgProfile) {
        orgProfile = await prisma.orgProfile.create({ data: {} })
      }

      const nowManila = manilaHHMM(new Date())
      if (nowManila >= orgProfile.dutyCheckInCutoff) {
        return res.status(403).json({
          error: `Duty check-in is only allowed before ${orgProfile.dutyCheckInCutoff}.`,
        })
      }

      // Check for open (not-yet-checked-out) duty record today
      const todayStart = new Date(date)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(date)
      todayEnd.setHours(23, 59, 59, 999)

      const existing = await prisma.attendance.findFirst({
        where: {
          userId,
          type: 'duty',
          dutyDate: { gte: todayStart, lte: todayEnd },
          checkOutAt: null,
        },
      })

      if (existing) {
        return res.status(409).json({ error: 'Already checked in. Check out before checking in again.' })
      }

      // Server-side distance validation for self check-ins
      if (lat !== undefined && lng !== undefined) {
        requireStaff(user)
      }

      try {
        const record = await prisma.attendance.create({
          data: {
            type: 'duty',
            dutyDate: date,
            userId,
            method: lat !== undefined ? 'self' : 'manual',
            lat: lat ? parseFloat(lat) : null,
            lng: lng ? parseFloat(lng) : null,
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
