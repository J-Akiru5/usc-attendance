import { defineApiHandler, requestPath, respond } from '../utils/http'

// Terminal case of the legacy `api/index.ts` router: an /api/** path no route
// claimed answers with the same JSON 404 (OPTIONS is answered by
// `defineApiHandler` first), instead of falling through to server-rendered HTML.
export default defineApiHandler((event) => {
  return respond(event, 404, { error: `API route not found: ${requestPath(event)}` })
})
