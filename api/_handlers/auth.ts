import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { resend } from '../_lib/resend.js'
import { authenticate, requireStaff, requireSuperAdmin } from '../_lib/auth.js'

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
export async function me(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req, { allowMustChangePassword: true })
    return res.status(200).json(user)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized'
    const status = message.includes('Access denied') ? 403 : 401
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// GET/PUT /api/auth/users  (also handles PUT /api/auth/profile alias)
// ---------------------------------------------------------------------------
export async function users(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await authenticate(req)

    if (req.method === 'GET') {
      requireStaff(user)

      const allUsers = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, email: true, name: true, position: true, role: true, canManageContent: true },
        orderBy: { name: 'asc' },
      })

      return res.status(200).json(allUsers)
    }

    if (req.method === 'PUT') {
      const { name, position } = req.body

      if (!name || !position) {
        return res.status(400).json({ error: 'Name and position are required' })
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { name, position },
      })

      return res.status(200).json({ user: updatedUser })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/password-reset
// ---------------------------------------------------------------------------
export async function requestPasswordReset(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email } = req.body ?? {}

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required' })
  }

  // Always return the same generic message — never leak whether the email exists.
  const genericMessage = 'If that email exists, a reset link has been sent.'

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(200).json({ message: genericMessage })
    }

    // Generate a Supabase recovery link (the link contains the OTP token in the URL hash).
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${process.env.SITE_URL || 'https://uscattendance.syntaxure.dev'}/reset-password`,
      },
    })

    if (linkError) {
      console.error('[password-reset] generateLink failed:', linkError.message)
      return res.status(200).json({ message: genericMessage })
    }

    const actionLink = linkData.properties.action_link

    // Send the reset email via Resend.
    const { error: sendError } = await resend.emails.send({
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
      `,
    })

    if (sendError) {
      console.error('[password-reset] Resend send failed:', sendError.message)
      // Still return the generic message — never leak send failures.
    }

    return res.status(200).json({ message: genericMessage })
  } catch (err) {
    console.error('[password-reset] unexpected error:', err)
    return res.status(200).json({ message: genericMessage })
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
export async function changePassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const authUser = await authenticate(req, { allowMustChangePassword: true })
    const { newPassword } = req.body

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'newPassword is required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // Update the password in Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      authUser.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('[change-password] Supabase update failed:', updateError.message)
      return res.status(500).json({ error: 'Failed to update password' })
    }

    // Clear mustChangePassword flag in Prisma
    await prisma.user.update({
      where: { id: authUser.id },
      data: { mustChangePassword: false },
    })

    return res.status(200).json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : message.includes('Unauthorized') ? 401 : 500
    return res.status(status).json({ error: message })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/auth/users/:id
// ---------------------------------------------------------------------------
export async function userById(req: VercelRequest, res: VercelResponse, id: string) {
  try {
    const user = await authenticate(req)

    if (req.method === 'PATCH') {
      requireSuperAdmin(user)

      const { canManageContent } = req.body
      if (typeof canManageContent !== 'boolean') {
        return res.status(400).json({ error: 'canManageContent (boolean) is required' })
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { canManageContent },
        select: { id: true, email: true, name: true, position: true, role: true, canManageContent: true },
      })

      return res.status(200).json(updated)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
