import { getMethod } from 'h3'
import { authenticate } from '../../utils/auth'
import { prisma } from '../../utils/prisma'
import { supabaseAdmin } from '../../utils/supabase'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../utils/http'

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const authUser = await authenticate(event, { allowMustChangePassword: true })
  const { newPassword } = await readJsonBody(event) ?? {}

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
    data: { mustChangePassword: false }
  })

  return { success: true }
})
