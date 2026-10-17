import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireSuperAdmin } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { STUDENT_ROLE } from '../../utils/students'

const PAGE = 50

const select = {
  id: true,
  name: true,
  email: true,
  active: true,
  createdAt: true,
  studentProfile: { select: { studentNo: true, program: true } }
} as const

// ---------------------------------------------------------------------------
// GET /api/students?q=&page=   — super_admin only
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireSuperAdmin(actor)

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : ''
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1)

  const where = {
    role: STUDENT_ROLE,
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
        { studentProfile: { studentNo: { contains: q, mode: 'insensitive' as const } } }
      ]
    })
  }

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select, orderBy: { name: 'asc' }, skip: (page - 1) * PAGE, take: PAGE })
  ])
  return { total, page, pageSize: PAGE, students: rows }
})
