import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../utils/http'
import { clearanceCode, clearanceState } from '../../utils/payments'
import { notifier, notifyUser } from '../../utils/notify'

/**
 * POST /api/clearance/issue — staff issue a clearance certificate (plan §8.5)
 * for a student who owes nothing. A student with unpaid fines is refused: the
 * certificate would be a lie.
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)

  const body = await readJsonBody(event) ?? {}
  const userId = typeof body.userId === 'string' ? body.userId : ''
  if (!userId) throw badRequest('userId is required')

  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, studentProfile: { select: { studentNo: true } } }
  })
  if (!student) throw new HttpError(404, 'Student not found')

  const fines = await prisma.fine.findMany({ where: { userId }, select: { id: true, amountCentavos: true, status: true } })
  const state = clearanceState(fines)
  if (!state.cleared) {
    throw new HttpError(409, `Still owed: ${state.unpaidPesos}. Settle or waive everything first.`)
  }

  // The code is random and unique; a collision is astronomically unlikely but
  // retrying is cheaper than explaining one.
  let created = null
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await prisma.clearance.create({
        data: {
          userId,
          code: clearanceCode(),
          coveredCentavos: fines.reduce((sum, fine) => sum + fine.amountCentavos, 0),
          coveredFines: fines.map(fine => ({ id: fine.id, amountCentavos: fine.amountCentavos, status: fine.status })),
          issuedBy: user.id,
          note: typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null
        }
      })
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== 'P2002' || attempt === 4) throw error
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'clearance_issued',
      details: JSON.stringify({ clearanceId: created?.id, studentId: userId, coveredCentavos: created?.coveredCentavos }),
      performedBy: user.id
    }
  })

  await notifyUser(notifier(prisma), {
    userId,
    kind: 'clearance_issued',
    title: 'You are cleared',
    body: `The council issued your clearance certificate. Anyone can check it at /verify/${created?.code}.`,
    link: '/fines'
  }).catch(() => {})

  return respond(event, 201, { clearance: created, state })
})
