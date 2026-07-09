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
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    throw new Error('Invalid or expired token')
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
  })

  if (!dbUser) {
    throw new Error('User not found in database')
  }

  return dbUser as AuthUser
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
