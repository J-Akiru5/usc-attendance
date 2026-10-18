import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireSuperAdmin } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { STUDENT_ROLE } from '../../utils/students'
import { orderBy as orderByFor, parseTableQuery, skipTake } from '../../utils/pagination'

const SORTABLE = ['name', 'email', 'createdAt', 'yearLevel'] as const

function strParam(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

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
// GET /api/students?q=&page=&pageSize=&sort=&dir=&collegeId=&programId=&yearLevel=&sectionId=&active=
//   — super_admin only. Server-side paging/sorting/filtering for useDataTable
//   (plan §8.1); `students` stays the row key so older callers keep working.
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireSuperAdmin(actor)

  const query = getQuery(event)
  const table = parseTableQuery(query, {
    allowedSort: [...SORTABLE],
    defaultSort: 'name',
    defaultDir: 'asc'
  })

  const profileFilter: Record<string, unknown> = {}
  const collegeId = strParam(query.collegeId)
  const programId = strParam(query.programId)
  const sectionId = strParam(query.sectionId)
  const yearLevel = Number.parseInt(strParam(query.yearLevel), 10)
  const active = strParam(query.active)
  if (collegeId) profileFilter.collegeId = collegeId
  if (programId) profileFilter.programId = programId
  if (sectionId) profileFilter.sectionId = sectionId
  if (Number.isInteger(yearLevel) && yearLevel > 0) profileFilter.yearLevel = yearLevel

  const where = {
    role: STUDENT_ROLE,
    ...(active === 'true' ? { active: true } : active === 'false' ? { active: false } : {}),
    ...(Object.keys(profileFilter).length > 0 && { studentProfile: { is: profileFilter } }),
    ...(table.q && {
      OR: [
        { name: { contains: table.q, mode: 'insensitive' as const } },
        { email: { contains: table.q, mode: 'insensitive' as const } },
        { studentProfile: { is: { studentNo: { contains: table.q, mode: 'insensitive' as const } } } }
      ]
    })
  }

  // Sorting by year level means sorting the profile relation, not the user row.
  const order = table.sort === 'yearLevel'
    ? { studentProfile: { yearLevel: table.dir } }
    : orderByFor(table, { name: 'asc' })

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select, orderBy: order, ...skipTake(table) })
  ])
  return { total, page: table.page, pageSize: table.pageSize, students: rows }
})
