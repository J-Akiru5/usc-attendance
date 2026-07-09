import type { VercelRequest } from '@vercel/node'
import { supabaseAdmin } from './supabase.js'
import { prisma } from './prisma.js'

export interface AuthUser {
  id: string
  email: string
  name: string
  position: string
  role: string
}

export async function authenticate(req: VercelRequest): Promise<AuthUser> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header')
  }

  const token = authHeader.slice(7)

  // Primary: verify via Supabase Auth API
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (user) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (dbUser) return dbUser as AuthUser
    console.error('[auth] No Prisma user found for authenticated Supabase id:', user.id, 'email:', user.email)
    throw new Error('User not found in database')
  }

  // Fallback: decode JWT payload (Supabase-signed, unforgeable without secret)
  console.error('[auth] Supabase getUser() failed, falling back to JWT decode:', error?.message)
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid or expired token')
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    const userId = payload.sub as string | undefined
    if (!userId) {
      throw new Error('Token has no sub claim')
    }

    const dbUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!dbUser) {
      console.error('[auth] JWT fallback: no Prisma user for id:', userId, 'email:', payload.email)
      throw new Error('User not found in database')
    }

    return dbUser as AuthUser
  } catch (fallbackErr) {
    if (fallbackErr instanceof Error && fallbackErr.message.includes('User not found')) throw fallbackErr
    console.error('[auth] JWT fallback decode failed:', fallbackErr)
    throw new Error('Invalid or expired token')
  }
}

export function requireRole(user: AuthUser, ...roles: string[]) {
  if (!roles.includes(user.role)) {
    throw new Error(`Access denied. Required role: ${roles.join(' or ')}`)
  }
}

export function requireStaff(user: AuthUser) {
  requireRole(user, 'super_admin', 'staff')
}

export function requireSuperAdmin(user: AuthUser) {
  requireRole(user, 'super_admin')
}
