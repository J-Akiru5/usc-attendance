import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { authenticate, requireStaff } from '../_lib/auth'

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

      // Check for duplicate duty check-in today
      const todayStart = new Date(date)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(date)
      todayEnd.setHours(23, 59, 59, 999)

      const existing = await prisma.attendance.findFirst({
        where: {
          userId,
          type: 'duty',
          dutyDate: { gte: todayStart, lte: todayEnd },
        },
      })

      if (existing) {
        return res.status(409).json({ error: 'Already checked in for duty today' })
      }

      // Server-side distance validation for self check-ins
      if (lat !== undefined && lng !== undefined) {
        // For now, require staff for duty check-ins (no office coords in OrgProfile yet)
        requireStaff(user)
      }

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
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
