import { getMethod, getRouterParam } from 'h3'
import { prisma } from '../../../utils/prisma'
import { authenticate, requireStaff } from '../../../utils/auth'
import { requireCapability } from '../../../utils/rbac'
import { defineApiHandler, notFound, readJsonBody, respond } from '../../../utils/http'
import { validateDocumentType } from '../../../utils/documents'

/**
 * PUT /api/documents/types/:id — rename a filing type, change the prefix its
 * numbers carry or archive it (plan §8.8).
 *
 * Numbers already filed keep the text they were filed with: changing a prefix
 * affects the *next* number, never an existing one, and the sequence itself is
 * never rewound (a filing type can never re-issue a number).
 */
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'PUT') return respond(event, 405, { error: 'Method not allowed' })

  const user = await authenticate(event)
  requireStaff(user)
  requireCapability(user, 'documents.publish')

  const id = getRouterParam(event, 'id') ?? ''
  const existing = await prisma.documentType.findUnique({ where: { id } })
  if (!existing) throw notFound('Filing type not found')

  const body = await readJsonBody(event) ?? {}
  const input = validateDocumentType({
    name: body.name ?? existing.name,
    prefix: body.prefix ?? existing.prefix,
    pad: body.pad ?? existing.pad
  })
  const archived = typeof body.archived === 'boolean' ? body.archived : existing.archived

  const type = await prisma.documentType.update({
    where: { id },
    data: { ...input, archived },
    select: {
      id: true,
      key: true,
      name: true,
      prefix: true,
      pad: true,
      archived: true,
      sequences: { select: { year: true, last: true } }
    }
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: archived !== existing.archived ? (archived ? 'document_type_archived' : 'document_type_restored') : 'document_type_updated',
      details: JSON.stringify({ typeId: id, key: existing.key, prefix: type.prefix, pad: type.pad }),
      performedBy: user.id
    }
  })

  return { type }
})
