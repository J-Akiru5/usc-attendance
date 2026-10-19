import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireSuperAdmin } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, isUniqueViolation, notFound, readJsonBody, respond } from '../../utils/http'
import { normalizeName, normalizeStudentNo, STUDENT_ROLE } from '../../utils/students'
import { normalizeContactNumber, resolvePlacement } from '../../utils/academic'
import { auditContext, auditWrite } from '../../utils/audit'

const select = {
  id: true,
  name: true,
  email: true,
  active: true,
  createdAt: true,
  studentProfile: {
    select: {
      studentNo: true,
      program: true,
      yearLevel: true,
      contactNumber: true,
      college: { select: { id: true, code: true, name: true } },
      programRef: { select: { id: true, code: true, name: true } },
      section: { select: { id: true, name: true, yearLevel: true } }
    }
  }
} as const

// ---------------------------------------------------------------------------
// PATCH /api/students/:id
//   { name?, studentNo?, program?, active?, yearLevel?, sectionId?, contactNumber? }
//   — super_admin only. The academic placement is validated against the
//   reference data (same rules as registration).
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'PATCH') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireSuperAdmin(actor)

  const id = getRouterParam(event, 'id') ?? ''

  const target = await prisma.user.findUnique({ where: { id }, include: { studentProfile: true } })
  if (!target || target.role !== STUDENT_ROLE) throw notFound('Student not found')

  const { name, studentNo, program, active, yearLevel, sectionId, contactNumber } = await readJsonBody(event) ?? {}
  if (
    name === undefined && studentNo === undefined && program === undefined && active === undefined
    && yearLevel === undefined && sectionId === undefined && contactNumber === undefined
  ) {
    throw badRequest('Nothing to update')
  }
  if (active !== undefined && typeof active !== 'boolean') throw badRequest('active must be a boolean')
  if (program !== undefined && (typeof program !== 'string' || program.length > 60)) {
    throw badRequest('Program must be text up to 60 characters')
  }

  const userData: { name?: string, active?: boolean } = {}
  if (name !== undefined) userData.name = normalizeName(name)
  if (active !== undefined) userData.active = active

  const profileData: {
    studentNo?: string
    program?: string | null
    collegeId?: string | null
    programId?: string | null
    yearLevel?: number | null
    sectionId?: string | null
    contactNumber?: string | null
  } = {}
  if (studentNo !== undefined) profileData.studentNo = normalizeStudentNo(studentNo)
  if (program !== undefined) profileData.program = program.trim() || null

  // Academic placement corrections: setting a section (or year level) goes
  // through the same validation as registration; clearing everything wipes the
  // placement but keeps the free-text program for display.
  const touchesPlacement = yearLevel !== undefined || sectionId !== undefined
  if (touchesPlacement) {
    if (yearLevel === null && (sectionId === null || sectionId === undefined)) {
      profileData.collegeId = null
      profileData.programId = null
      profileData.yearLevel = null
      profileData.sectionId = null
    } else {
      const current = target.studentProfile
      const placement = await resolvePlacement(prisma, {
        collegeId: current?.collegeId ?? null,
        programId: current?.programId ?? null,
        yearLevel: yearLevel === undefined ? current?.yearLevel ?? null : yearLevel as number | null,
        sectionId: sectionId === undefined ? current?.sectionId ?? null : sectionId as string | null
      })
      profileData.collegeId = placement?.collegeId ?? null
      profileData.programId = placement?.programId ?? null
      profileData.yearLevel = placement?.yearLevel ?? null
      profileData.sectionId = placement?.sectionId ?? null
      if (placement) profileData.program = placement.programName
    }
  }
  if (contactNumber !== undefined) profileData.contactNumber = normalizeContactNumber(contactNumber)

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
      await auditWrite(tx, {
        actor: actor,
        action: 'student_updated',
        targetType: 'student',
        targetId: id,
        details: { changed: Object.keys({ ...userData, ...profileData }), active: userData.active },
        ...auditContext(event)
      })
      return u
    })
    return updated
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'That student ID is already registered to someone else')
    throw err
  }
})
