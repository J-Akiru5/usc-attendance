import { getMethod } from 'h3'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const user = await authenticate(event, { allowMustChangePassword: true })
  return user
})
