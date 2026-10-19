import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { requireCapability } from '../../utils/rbac'
import { defineApiHandler, readJsonBody, respond } from '../../utils/http'
import { validateNewDocumentType } from '../../utils/documents'

/**
 * /api/documents/types — the filing types and the numbers they carry (plan
 * §8.8). Reading is officer work; adding a type is a publish-capability action.
 *
 * The seeded five (minutes, resolutions, memos, constitution/by-laws, reports)
 * are a starting point: the council can add a sixth and change any prefix.
 */
export default defineApiHandler(async (event) => {
  const user = await authenticate(event)
  requireStaff(user)
  const method = getMethod(event)

  if (method === 'GET') {
    const types = await prisma.documentType.findMany({
      orderBy: [{ archived: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        prefix: true,
        pad: true,
        archived: true,
        sequences: { select: { year: true, last: true } },
        _count: { select: { documents: true } }
      }
    })
    return { types }
  }

  if (method === 'POST') {
    requireCapability(user, 'documents.publish')
    const body = await readJsonBody(event) ?? {}
    const input = validateNewDocumentType(body)

    const existing = await prisma.documentType.findUnique({ where: { key: input.key }, select: { id: true } })
    if (existing) return respond(event, 409, { error: `The type "${input.key}" already exists` })

    const type = await prisma.documentType.create({ data: input })

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'document_type_created',
        details: JSON.stringify({ typeId: type.id, key: type.key, prefix: type.prefix, pad: type.pad }),
        performedBy: user.id
      }
    })

    return respond(event, 201, { type })
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
