import { Resend } from 'resend'
import type { CreateEmailOptions } from 'resend'
import { prisma } from './prisma'
import { emailQuota, recordEmailSend } from './email-quota'

/**
 * `RESEND_BASE_URL` repoints the SDK at another API host. The e2e runner sets it
 * to a local capture server so tests never send real email; when it is unset
 * (production and normal development) the SDK talks to api.resend.com as before.
 *
 * The client is built on first *use*, never at import: modules that merely might
 * send mail (the notifier) are imported by unit tests, and `new Resend()` throws
 * when there is no API key — which CI, correctly, does not have.
 */
let client: Resend | null = null

function resendClient(): Resend {
  if (!client) {
    client = new Resend(
      process.env.RESEND_API_KEY,
      process.env.RESEND_BASE_URL ? { baseUrl: process.env.RESEND_BASE_URL } : undefined
    )
  }
  return client
}

export interface SendEmailResult {
  /** The SDK error, or null when the mail was accepted (or intentionally skipped). */
  error: { message: string } | null
  /** True when the daily guard stopped the send before it reached Resend. */
  skipped?: boolean
}

/**
 * Sends one transactional email through the daily quota guard (plan §11.1):
 * refused with `skipped` once the day's budget is spent, and counted when the
 * send succeeds. Callers keep treating errors as best-effort, exactly as they
 * did when they called `resend.emails.send` directly.
 */
export async function sendEmail(kind: string, payload: CreateEmailOptions): Promise<SendEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY is not set; skipping ${kind}`)
    return { error: null, skipped: true }
  }

  const quota = await emailQuota(prisma)
  if (quota.exceeded) {
    console.warn(`[email] daily quota reached (${quota.count}/${quota.limit}); skipping ${kind}`)
    return { error: null, skipped: true }
  }

  const { error } = await resendClient().emails.send(payload)
  if (error) {
    console.error(`[email] ${kind} send failed:`, error.message)
    return { error }
  }

  try {
    await recordEmailSend(prisma, kind)
  } catch (err) {
    // Counting is best effort: never fail a delivered email because of it.
    console.error('[email] could not record the send:', err instanceof Error ? err.message : err)
  }
  return { error: null }
}
