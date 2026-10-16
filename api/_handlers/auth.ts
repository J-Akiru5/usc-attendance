import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { resend } from '../_lib/resend.js'
import { authenticate, requireStaff, requireSuperAdmin } from '../_lib/auth.js'
import { badRequest, handle, HttpError } from '../_lib/http.js'
import { siteUrl } from '../_lib/site.js'

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
export const me = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await authenticate(req, { allowMustChangePassword: true })
  return res.status(200).json(user)
})

// ---------------------------------------------------------------------------
// GET/PUT /api/auth/users  (also handles PUT /api/auth/profile alias)
// ---------------------------------------------------------------------------
export const users = handle(async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticate(req)

  if (req.method === 'GET') {
    requireStaff(user)

    const allUsers = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, email: true, name: true, position: true, role: true, canManageContent: true, canDelegate: true },
      orderBy: { name: 'asc' },
    })

    return res.status(200).json(allUsers)
  }

  if (req.method === 'PUT') {
    if (user.role === 'student') {
      throw new HttpError(403, 'Access denied. Students cannot edit their name; contact the USC.')
    }
    const { name, position } = req.body

    if (!name || !position) {
      throw badRequest('Name and position are required')
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { name, position },
    })

    return res.status(200).json({ user: updatedUser })
  }

  return res.status(405).json({ error: 'Method not allowed' })
})

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
        redirectTo: `${siteUrl()}/reset-password`,
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
export const changePassword = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authUser = await authenticate(req, { allowMustChangePassword: true })
  const { newPassword } = req.body

  if (!newPassword || typeof newPassword !== 'string') {
    throw badRequest('newPassword is required')
  }

  if (newPassword.length < 8) {
    throw badRequest('Password must be at least 8 characters')
  }

  // Update the password in Supabase Auth
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    authUser.id,
    { password: newPassword }
  )

  if (updateError) {
    console.error('[change-password] Supabase update failed:', updateError.message)
    throw new HttpError(500, 'Failed to update password')
  }

  // Clear mustChangePassword flag in Prisma
  await prisma.user.update({
    where: { id: authUser.id },
    data: { mustChangePassword: false },
  })

  return res.status(200).json({ success: true })
})

// ---------------------------------------------------------------------------
// PATCH /api/auth/users/:id
// ---------------------------------------------------------------------------
export const userById = handle(async (req: VercelRequest, res: VercelResponse, id: string) => {
  const user = await authenticate(req)

  if (req.method === 'PATCH') {
    requireSuperAdmin(user)

    const { canManageContent, canDelegate } = req.body
    if (canManageContent !== undefined && typeof canManageContent !== 'boolean') {
      throw badRequest('canManageContent must be a boolean')
    }
    if (canDelegate !== undefined && typeof canDelegate !== 'boolean') {
      throw badRequest('canDelegate must be a boolean')
    }
    if (canManageContent === undefined && canDelegate === undefined) {
      throw badRequest('canManageContent or canDelegate (boolean) is required')
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(canManageContent !== undefined && { canManageContent }),
        ...(canDelegate !== undefined && { canDelegate }),
      },
      select: { id: true, email: true, name: true, position: true, role: true, canManageContent: true, canDelegate: true },
    })

    if (canDelegate !== undefined) {
      await prisma.auditLog.create({
        data: {
          userId: id,
          action: canDelegate ? 'delegate_power_granted' : 'delegate_power_removed',
          performedBy: user.id,
        },
      })
    }

    return res.status(200).json(updated)
  }

  return res.status(405).json({ error: 'Method not allowed' })
})
