import type { VercelRequest, VercelResponse } from '@vercel/node'
import { prisma } from '../_lib/prisma.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { resend } from '../_lib/resend.js'
import { randomBytes } from 'crypto'
import { handle, HttpError } from '../_lib/http.js'
import { clientIp, overLimit, parseRegistration, STUDENT_ROLE } from '../_lib/students.js'

const GENERIC =
  'If your details are eligible, a verification link has been sent to your school email. Open it to finish signing up.'

const TEN_MIN = 10 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function siteUrl(): string {
  return process.env.SITE_URL || 'https://uscattendance.syntaxure.dev'
}

async function audit(action: string, key: string, extra: Record<string, unknown> = {}, userId?: string) {
  await prisma.auditLog.create({
    data: { userId: userId ?? null, action, details: JSON.stringify({ k: key, ...extra }), performedBy: null },
  })
}

// ---------------------------------------------------------------------------
// POST /api/auth/register  — public student self-registration
//
// Always answers with the same message whether or not the email / student ID is
// already taken, so it cannot be used to discover who has an account.
// ---------------------------------------------------------------------------
export const register = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ipKey = `|ip=${clientIp(req.headers)}|`
  if (await overLimit(prisma, 'student_register_attempt', ipKey, 8, TEN_MIN)) {
    throw new HttpError(429, 'Too many sign-up attempts. Please wait a few minutes and try again.')
  }

  const input = parseRegistration(req.body)

  const emailKey = `|em=${input.email}|`
  if (await overLimit(prisma, 'student_register_attempt', emailKey, 3, ONE_HOUR)) {
    throw new HttpError(429, 'Too many sign-up attempts for this email. Please try again later.')
  }
  await audit('student_register_attempt', ipKey + emailKey)

  // Existing account for this email?
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    let staleUnverified = false
    if (existing.role === STUDENT_ROLE) {
      const { data: au } = await supabaseAdmin.auth.admin.getUserById(existing.id)
      staleUnverified = !!au?.user && !au.user.email_confirmed_at
    }
    if (!staleUnverified) {
      await audit('student_register_duplicate', emailKey, { reason: 'email' })
      return res.status(200).json({ message: GENERIC })
    }
    // A previous sign-up that never verified: replace it so the person can retry.
    await prisma.user.delete({ where: { id: existing.id } })
    await supabaseAdmin.auth.admin.deleteUser(existing.id)
  }

  const takenNo = await prisma.studentProfile.findUnique({ where: { studentNo: input.studentNo } })
  if (takenNo) {
    await audit('student_register_duplicate', emailKey, { reason: 'studentNo' })
    return res.status(200).json({ message: GENERIC })
  }

  // Creates the (unconfirmed) auth user and returns the verification link.
  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'signup',
    email: input.email,
    // Throwaway password nobody knows; the student chooses their own on the page the link opens.
    password: randomBytes(32).toString('base64url') + 'aA1!',
    options: { redirectTo: `${siteUrl()}/reset-password?welcome=1`, data: { full_name: input.name } },
  })
  if (linkError || !link?.user) {
    console.error('[register] generateLink failed:', linkError?.message)
    return res.status(200).json({ message: GENERIC })
  }

  try {
    await prisma.user.create({
      data: {
        id: link.user.id,
        email: input.email,
        name: input.name,
        position: 'Student',
        role: STUDENT_ROLE,
        mustChangePassword: false,
        active: true,
        studentProfile: { create: { studentNo: input.studentNo, program: input.program } },
      },
    })
  } catch (err) {
    console.error('[register] database insert failed:', err instanceof Error ? err.message : err)
    await supabaseAdmin.auth.admin.deleteUser(link.user.id).catch(() => {})
    return res.status(200).json({ message: GENERIC })
  }

  const { error: sendError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: input.email,
    subject: 'Verify your USC Attendance account',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e293b; margin-bottom: 16px;">Confirm your email</h2>
        <p style="color: #475569; line-height: 1.6;">
          Hi ${escapeHtml(input.name)},<br/><br/>
          Thanks for signing up for the USC Attendance portal. Confirm your school email and choose your password to activate your account.
        </p>
        <a href="${link.properties.action_link}"
           style="display: inline-block; padding: 12px 24px; background-color: #d4a843; color: #1e293b;
                  font-weight: bold; text-decoration: none; border-radius: 8px; margin: 16px 0;">
          Verify email and set password
        </a>
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.6;">
          If you didn't sign up, you can ignore this message and no account will be activated.
        </p>
        <p style="color: #94a3b8; font-size: 12px;">- USC Attendance · ISUFST Dingle Campus</p>
      </div>
    `,
  })
  if (sendError) {
    console.error('[register] Resend send failed:', sendError.message)
  }

  await audit('student_registered', emailKey, {}, link.user.id)
  return res.status(200).json({ message: GENERIC })
})
