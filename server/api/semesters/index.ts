import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, readJsonBody, respond } from '../../utils/http'
import { requireSettingsManager, validateSemester } from '../../utils/retention'

// ---------------------------------------------------------------------------
// POST /api/semesters            — define a semester (settings managers)
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') return respond(event, 405, { error: 'Method not allowed' })
  const actor = await authenticate(event)
  requireSettingsManager(actor)

  const existing = await prisma.semester.findMany()
  const body = await readJsonBody(event) ?? {}
  const data = validateSemester({ name: body.name, startsOn: body.startsOn, endsOn: body.endsOn }, existing)
  const created = await prisma.semester.create({ data: { name: data.name, startsOn: data.startsOn, endsOn: data.endsOn } })
  await prisma.auditLog.create({
    data: { userId: null, action: 'semester_added', details: JSON.stringify({ id: created.id, name: created.name }), performedBy: actor.id }
  })
  return respond(event, 201, created)
})
