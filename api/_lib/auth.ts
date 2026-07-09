import type { VercelRequest } from '@vercel/node'
import { jwtVerify } from 'jose'
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
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (user) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (dbUser) return dbUser as AuthUser
    console.error('[auth] No Prisma user found for authenticated Supabase id:', user.id, 'email:', user.email)
    throw new Error('User not found in database')
  }

  // Fallback: verify JWT signature using project's HS256 secret
  console.error('[auth] Supabase getUser() failed, trying JWT verification:', JSON.stringify(error))
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!jwtSecret) {
    console.error('[auth] No SUPABASE_JWT_SECRET set — cannot verify token')
    throw new Error('Invalid or expired token')
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret))
    const userId = payload.sub
    if (!userId) throw new Error('Token has no sub claim')

    const dbUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!dbUser) {
      console.error('[auth] JWT fallback: no Prisma user for id:', userId, 'email:', payload.email)
      throw new Error('User not found in database')
    }
    return dbUser as AuthUser
  } catch (jwtErr) {
    if (jwtErr instanceof Error && jwtErr.message === 'User not found in database') throw jwtErr
    console.error('[auth] JWT verification failed:', jwtErr)
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
