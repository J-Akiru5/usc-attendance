import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { authenticate } from '../../utils/auth'
import { defineApiHandler, respond } from '../../utils/http'
import { CONSENT_SUMMARY } from '../../utils/consent'

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'GET') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const user = await authenticate(event, { allowMustChangePassword: true })

  // What they agreed to, and what that notice said (plan §11.2). A null consent
  // means the account predates the record — the UI can then ask again.
  const consent = await prisma.user.findUnique({
    where: { id: user.id },
    select: { consentAt: true, consentVersion: true, consentSource: true }
  })

  return {
    ...user,
    consent: { ...consent, summary: CONSENT_SUMMARY }
  }
})
