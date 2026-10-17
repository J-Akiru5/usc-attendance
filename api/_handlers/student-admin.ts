import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireSuperAdmin } from '../_lib/auth.js'
import { badRequest, handle, HttpError, isUniqueViolation, notFound } from '../_lib/http.js'
import { normalizeName, normalizeStudentNo, STUDENT_ROLE } from '../_lib/students.js'

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
export const students = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const actor = await authenticate(req)
  requireSuperAdmin(actor)

  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : ''
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)

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
  return res.status(200).json({ total, page, pageSize: PAGE, students: rows })
})

// ---------------------------------------------------------------------------
// PATCH /api/students/:id   { name?, studentNo?, program?, active? }  — super_admin only
// ---------------------------------------------------------------------------
export const studentById = handle(async (req: VercelRequest, res: VercelResponse, id: string) => {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })
  const actor = await authenticate(req)
  requireSuperAdmin(actor)

  const target = await prisma.user.findUnique({ where: { id }, include: { studentProfile: true } })
  if (!target || target.role !== STUDENT_ROLE) throw notFound('Student not found')

  const { name, studentNo, program, active } = req.body ?? {}
  if (name === undefined && studentNo === undefined && program === undefined && active === undefined) {
    throw badRequest('Nothing to update')
  }
  if (active !== undefined && typeof active !== 'boolean') throw badRequest('active must be a boolean')
  if (program !== undefined && (typeof program !== 'string' || program.length > 60)) {
    throw badRequest('Program must be text up to 60 characters')
  }

  const userData: { name?: string, active?: boolean } = {}
  if (name !== undefined) userData.name = normalizeName(name)
  if (active !== undefined) userData.active = active

  const profileData: { studentNo?: string, program?: string | null } = {}
  if (studentNo !== undefined) profileData.studentNo = normalizeStudentNo(studentNo)
  if (program !== undefined) profileData.program = program.trim() || null

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: {
          ...userData,
          ...(Object.keys(profileData).length > 0 && {
            studentProfile: { update: profileData }
          })
        },
        select
      })
      await tx.auditLog.create({
        data: {
          userId: id,
          action: 'student_updated',
          details: JSON.stringify({ changed: Object.keys({ ...userData, ...profileData }), active: userData.active }),
          performedBy: actor.id
        }
      })
      return u
    })
    return res.status(200).json(updated)
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'That student ID is already registered to someone else')
    throw err
  }
})
