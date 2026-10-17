import { defineApiHandler, requestPath, respond } from '../utils/http'

// `/api` itself has no sub-path: the legacy router answered it with the same
// JSON 404, so keep that instead of an HTML page.
export default defineApiHandler((event) => {
  return respond(event, 404, { error: `API route not found: ${requestPath(event)}` })
})
