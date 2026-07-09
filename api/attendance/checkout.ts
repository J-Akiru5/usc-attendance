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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req)
    const { eventId, dutyDate, userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' })
    }

    if (!eventId && !dutyDate) {
      return res.status(400).json({ error: 'Either eventId or dutyDate is required' })
    }

    // Determine self-checkout vs manual checkout
    const isSelf = user.id === userId
    if (!isSelf) {
      // Manual checkout — require staff role
      requireStaff(user)

      // Self-targeting guard: staff cannot manually check themselves out
      // (This branch is only reached when isSelf is false, so this guard
      // is technically unreachable here, but we keep it for clarity and
      // defense-in-depth matching the check-in pattern)
    }

    // Find the open record
    let openRecord
    if (eventId) {
      openRecord = await prisma.attendance.findFirst({
        where: { eventId, userId, checkOutAt: null },
      })
    } else {
      const date = new Date(dutyDate)
      const todayStart = new Date(date)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(date)
      todayEnd.setHours(23, 59, 59, 999)

      openRecord = await prisma.attendance.findFirst({
        where: {
          userId,
          type: 'duty',
          dutyDate: { gte: todayStart, lte: todayEnd },
          checkOutAt: null,
        },
      })
    }

    if (!openRecord) {
      return res.status(404).json({ error: 'No open check-in record found. You may have already checked out.' })
    }

    // Time-window enforcement for duty checkout only
    if (!eventId && dutyDate) {
      let orgProfile = await prisma.orgProfile.findFirst()
      if (!orgProfile) {
        orgProfile = await prisma.orgProfile.create({ data: {} })
      }

      const nowManila = manilaHHMM(new Date())
      if (nowManila < orgProfile.dutyCheckOutStart) {
        return res.status(403).json({
          error: `Duty check-out is only allowed starting ${orgProfile.dutyCheckOutStart}.`,
        })
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

    return res.status(200).json(updated)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
