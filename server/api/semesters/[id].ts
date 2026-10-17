import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, noContent, notFound, respond } from '../../utils/http'
import { requireSettingsManager } from '../../utils/retention'

// ---------------------------------------------------------------------------
// DELETE /api/semesters/:id
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'DELETE') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireSettingsManager(actor)

  const id = getRouterParam(event, 'id') ?? ''
  const sem = await prisma.semester.findUnique({ where: { id } })
  if (!sem) throw notFound('Semester not found')
  await prisma.semester.delete({ where: { id } })
  await prisma.auditLog.create({
    data: { userId: null, action: 'semester_removed', details: JSON.stringify({ id, name: sem.name }), performedBy: actor.id }
  })
  return noContent(event, 204)
})
