import { getMethod, getQuery } from 'h3'
import { prisma } from '../../utils/prisma'
import { defineApiHandler, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET /api/cms/content
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const query = getQuery(event)
  const page = query.page as string
  if (!page) {
    return respond(event, 400, { error: 'Missing required query param: page' })
  }

  const siteContent = await prisma.siteContent.findUnique({
    where: { key: page }
  })

  if (!siteContent) {
    return respond(event, 404, { error: `No content found for page: ${page}` })
  }

  return siteContent.content
})
