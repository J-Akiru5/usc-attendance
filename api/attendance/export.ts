import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma'
import { authenticate, requireStaff } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req)
    requireStaff(user)

    const eventId = req.query.eventId as string
    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required' })
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const records = await prisma.attendance.findMany({
      where: { eventId },
      include: {
        user: { select: { name: true, position: true } },
        recorder: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const header = 'Name,Position,Method,Latitude,Longitude,Recorded By,Checked In At\n'
    const rows = records
      .map((r: { user: { name: string; position: string }; method: string; lat: number | null; lng: number | null; recorder: { name: string }; createdAt: Date }) =>
        [
          `"${r.user.name}"`,
          `"${r.user.position}"`,
          r.method,
          r.lat ?? '',
          r.lng ?? '',
          `"${r.recorder.name}"`,
          r.createdAt.toISOString(),
        ].join(',')
      )
      .join('\n')

    const csv = header + rows

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${event.title.replace(/[^a-zA-Z0-9 ]/g, '')}-attendance.csv"`
    )

    return res.status(200).send(csv)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
