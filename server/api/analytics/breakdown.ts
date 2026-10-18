import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, respond } from '../../utils/http'
import { attendedIds, groupRates, type GroupKey } from '../../utils/analytics'
import { activeAudience, attendanceRows, eventsInWindow, resolveSemester } from '../../utils/analytics-data'

const GROUP_KEYS: GroupKey[] = ['collegeId', 'yearLevel', 'sectionId']

/**
 * GET /api/analytics/breakdown?semesterId=&by=college|year|section — attendance
 * rate per group (plan §8.3's "by college / year / section").
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const query = getQuery(event)
  const by = String(query.by ?? 'collegeId') as GroupKey
  if (!GROUP_KEYS.includes(by)) {
    throw badRequest(`by must be one of ${GROUP_KEYS.join(', ')}`)
  }

  const window = await resolveSemester(prisma, typeof query.semesterId === 'string' ? query.semesterId : undefined)
  const events = await eventsInWindow(prisma, window)
  const [attendance, audience] = await Promise.all([
    attendanceRows(prisma, events.map(row => row.id)),
    activeAudience(prisma)
  ])

  const groups = groupRates(audience, attendedIds(attendance), by)

  // Resolve the identifiers the dashboard shows next to each bar.
  const ids = groups.map(group => group.key).filter(key => key !== 'unplaced')
  const labels = new Map<string, string>()
  if (ids.length > 0 && by === 'collegeId') {
    for (const row of await prisma.college.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } })) {
      labels.set(row.id, row.code ? `${row.code} · ${row.name}` : row.name)
    }
  } else if (ids.length > 0 && by === 'sectionId') {
    for (const row of await prisma.section.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })) {
      labels.set(row.id, row.name)
    }
  }

  return {
    by,
    semester: window.id ? { id: window.id, name: window.name } : null,
    groups: groups.map(group => ({
      ...group,
      label: group.key === 'unplaced'
        ? (by === 'yearLevel' ? 'No year level' : 'Not placed')
        : (labels.get(group.key) ?? group.key)
    }))
  }
})
