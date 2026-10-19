import { getMethod, getQuery, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { defineApiHandler, notFound, respond } from '../../../utils/http'
import { attendedIds, methodMix, rate, signatureRate } from '../../../utils/analytics'
import { attendanceRows, eventsInWindow, resolveSemester } from '../../../utils/analytics-data'
import { formatPeso, totalCentavos } from '../../../utils/fines'

/**
 * GET /api/analytics/students/:id?semesterId= — **Student 360** (plan §8.3):
 * one student's attendance history and standing. Staff may look anyone up; a
 * student may look at themselves (their own dashboard shows the same summary).
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  const studentId = getRouterParam(event, 'id') ?? ''

  if (user.id !== studentId) requireStaff(user)

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      role: true,
      studentProfile: {
        select: {
          studentNo: true,
          yearLevel: true,
          contactNumber: true,
          college: { select: { code: true, name: true } },
          programRef: { select: { code: true, name: true } },
          section: { select: { name: true } }
        }
      }
    }
  })
  if (!student) throw notFound('Student not found')

  const query = getQuery(event)
  const window = await resolveSemester(prisma, typeof query.semesterId === 'string' ? query.semesterId : undefined)
  const events = await eventsInWindow(prisma, window)
  const eventById = new Map(events.map(row => [row.id, row]))

  const allRows = await attendanceRows(prisma, events.map(row => row.id))
  const rows = allRows.filter(row => row.userId === studentId)

  const history = rows
    .map(row => ({
      eventId: row.eventId,
      title: row.eventId ? (eventById.get(row.eventId)?.title ?? 'Event') : 'Duty',
      date: row.eventId ? (eventById.get(row.eventId)?.date ?? null) : null,
      method: row.method,
      at: row.createdAt,
      signed: row.hasSignature === true
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime())

  // Fines and clearance (plan §8.5): part of Student 360 by design.
  const fines = await prisma.fine.findMany({
    where: { userId: studentId },
    orderBy: { issuedAt: 'desc' },
    include: { event: { select: { id: true, title: true, date: true } } }
  })
  const unpaid = totalCentavos(fines)

  return {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      active: student.active,
      role: student.role,
      studentNo: student.studentProfile?.studentNo ?? null,
      yearLevel: student.studentProfile?.yearLevel ?? null,
      contactNumber: student.studentProfile?.contactNumber ?? null,
      college: student.studentProfile?.college ?? null,
      program: student.studentProfile?.programRef ?? null,
      section: student.studentProfile?.section?.name ?? null
    },
    semester: window.id ? { id: window.id, name: window.name } : null,
    summary: {
      events: events.length,
      attended: attendedIds(rows).size,
      rate: rate(attendedIds(rows).size, events.length),
      signatures: {
        signed: rows.filter(row => row.hasSignature).length,
        rate: signatureRate(rows)
      },
      methods: methodMix(rows),
      firstAt: history.length > 0 ? history[history.length - 1]!.at : null,
      lastAt: history.length > 0 ? history[0]!.at : null
    },
    finances: {
      fines,
      unpaidCentavos: unpaid,
      unpaidPesos: formatPeso(unpaid),
      cleared: unpaid === 0
    },
    history
  }
})
