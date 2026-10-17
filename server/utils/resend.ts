import { Resend } from 'resend'

/**
 * `RESEND_BASE_URL` repoints the SDK at another API host. The e2e runner sets it
 * to a local capture server so tests never send real email; when it is unset
 * (production and normal development) the SDK talks to api.resend.com as before.
 */
export const resend = new Resend(
  process.env.RESEND_API_KEY,
  process.env.RESEND_BASE_URL ? { baseUrl: process.env.RESEND_BASE_URL } : undefined
)
