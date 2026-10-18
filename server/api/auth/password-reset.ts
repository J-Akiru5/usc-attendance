import { getMethod } from 'h3'
import { prisma } from '../../utils/prisma'
import { sendEmail } from '../../utils/resend'
import { supabaseAdmin } from '../../utils/supabase'
import { siteUrl } from '../../utils/site'
import { defineApiHandler, readJsonBody, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// POST /api/auth/password-reset
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const { email } = await readJsonBody(event) ?? {}

  if (!email || typeof email !== 'string') {
    return respond(event, 400, { error: 'email is required' })
  }

  // Always return the same generic message — never leak whether the email exists.
  const genericMessage = 'If that email exists, a reset link has been sent.'

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return { message: genericMessage }
    }

    // Generate a Supabase recovery link (the link contains the OTP token in the URL hash).
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${siteUrl()}/reset-password`
      }
    })

    if (linkError) {
      console.error('[password-reset] generateLink failed:', linkError.message)
      return { message: genericMessage }
    }

    const actionLink = linkData.properties.action_link

    // Send the reset email via Resend.
    const { error: sendError } = await sendEmail('password_reset', {
      from: process.env.RESEND_FROM_EMAIL!,
      to: email,
      subject: 'Reset your USC Attendance password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1e293b; margin-bottom: 16px;">Password Reset Request</h2>
          <p style="color: #475569; line-height: 1.6;">
            Hi ${user.name},<br/><br/>
            We received a request to reset your password for the USC Attendance portal.
            Click the button below to set a new password. This link expires in 1 hour.
          </p>
          <a href="${actionLink}"
             style="display: inline-block; padding: 12px 24px; background-color: #d4a843; color: #1e293b;
                    font-weight: bold; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #94a3b8; font-size: 12px; line-height: 1.6;">
            If you didn't request this, you can safely ignore this email.
            Your password will remain unchanged.
          </p>
          <p style="color: #94a3b8; font-size: 12px;">
            — USC Attendance · ISUFST Dingle Campus
          </p>
        </div>
      `
    })

    if (sendError) {
      console.error('[password-reset] Resend send failed:', sendError.message)
      // Still return the generic message — never leak send failures.
    }

    return { message: genericMessage }
  } catch (err) {
    console.error('[password-reset] unexpected error:', err)
    return { message: genericMessage }
  }
})
