import { getMethod, getQuery, setResponseHeader } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, readJsonBody, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET/POST /api/photos
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  // GET: public — list photos for an event with cursor pagination
  if (getMethod(event) === 'GET') {
    const query = getQuery(event)
    const eventSlug = query.eventSlug as string
    if (!eventSlug) {
      throw badRequest('Missing required query param: eventSlug')
    }

    const limit = Math.min(Math.max(parseInt(query.limit as string) || 24, 1), 100)
    const cursor = query.cursor as string | undefined

    const photosList = await prisma.photo.findMany({
      where: { eventSlug },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    })

    const hasMore = photosList.length > limit
    const data = hasMore ? photosList.slice(0, limit) : photosList
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null

    setResponseHeader(event, 'Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return { data, nextCursor }
  }

  const user = await authenticate(event)

  if (getMethod(event) === 'POST') {
    requireStaff(user)

    const { eventSlug, storageKeyFull, storageKeyThumb } = await readJsonBody(event) ?? {}
    if (!eventSlug || !storageKeyFull || !storageKeyThumb) {
      throw badRequest('Missing required fields: eventSlug, storageKeyFull, storageKeyThumb')
    }

    const photo = await prisma.photo.create({
      data: {
        eventSlug,
        storageKeyFull,
        storageKeyThumb,
        uploadedBy: user.id
      }
    })

    return respond(event, 201, photo)
  }

  return respond(event, 405, { error: 'Method not allowed' })
})
