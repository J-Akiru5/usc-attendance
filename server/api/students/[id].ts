import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireSuperAdmin } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { normalizeName, normalizeStudentNo, STUDENT_ROLE } from '../../utils/students'

const select = {
  id: true,
  name: true,
  email: true,
  active: true,
  createdAt: true,
  studentProfile: { select: { studentNo: true, program: true } }
} as const

// ---------------------------------------------------------------------------
// PATCH /api/students/:id   { name?, studentNo?, program?, active? }  — super_admin only
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'PATCH') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireSuperAdmin(actor)

  const id = getRouterParam(event, 'id') ?? ''

  const target = await prisma.user.findUnique({ where: { id }, include: { studentProfile: true } })
  if (!target || target.role !== STUDENT_ROLE) throw notFound('Student not found')

  const { name, studentNo, program, active } = await readJsonBody(event) ?? {}
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
    return updated
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'That student ID is already registered to someone else')
    throw err
  }
})
