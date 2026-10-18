import type { H3Event } from 'h3'
import { jwtVerify } from 'jose'
import { getRequestHeader } from 'h3'
import { serverSupabaseSession } from '#supabase/server'
import { supabaseAdmin } from './supabase'
import { prisma } from './prisma'
import { HttpError } from './http'
import { mergeCapabilities, requireCapability, type Capability } from './rbac'

export interface AuthUser {
  id: string
  email: string
  name: string
  position: string
  role: string
  canManageContent: boolean
  canDelegate: boolean
  canConfigure: boolean
  /** Capabilities from the user's roles, unioned with the legacy flags (plan §7.2). */
  capabilities: string[]
}

/**
 * Checks that apply once the database row is known: deactivated accounts are
 * refused everywhere, and a self-registered student must have verified their
 * email (enforced here so it never depends on a dashboard setting).
 */
function assertAccountUsable(
  dbUser: { active: boolean, role: string, mustChangePassword: boolean },
  emailConfirmed: boolean,
  options?: { allowMustChangePassword?: boolean }
) {
  if (!dbUser.active) {
    throw new HttpError(403, 'Access denied. This account is deactivated.')
  }
  if (dbUser.role === 'student' && !emailConfirmed) {
    throw new HttpError(403, 'Access denied. Please verify your email address first - check your inbox for the link.')
  }
  if (dbUser.mustChangePassword && !options?.allowMustChangePassword) {
    throw new HttpError(403, 'Access denied. Password change required.')
  }
}

/**
 * Token carried by this request: the legacy `Authorization: Bearer …` header
 * (what the current app and the e2e suites send) first, then the Supabase
 * cookie session `@nuxtjs/supabase` writes for SSR. `null` = anonymous caller.
 */
async function accessTokenOf(event: H3Event): Promise<string | null> {
  const authHeader = getRequestHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  try {
    const session = await serverSupabaseSession(event)
    return session?.access_token ?? null
  } catch {
    // No (or unreadable) cookie session — treated as anonymous below.
    return null
  }
}

export async function authenticate(
  event: H3Event,
  options?: { allowMustChangePassword?: boolean }
): Promise<AuthUser> {
  const token = await accessTokenOf(event)
  if (!token) {
    throw new HttpError(401, 'Missing or invalid authorization header')
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { roles: { include: { role: { include: { capabilities: true } } } } }
    })
    if (!dbUser) {
      console.error('[auth] No Prisma user found for authenticated Supabase id:', user.id, 'email:', user.email)
      throw new HttpError(401, 'User not found in database')
    }
    assertAccountUsable(dbUser, !!user.email_confirmed_at, options)
    return withCapabilities(dbUser)
  }

  // Fallback: verify JWT signature using project's HS256 secret
  console.error('[auth] Supabase getUser() failed, trying JWT verification:', JSON.stringify(error))
  const jwtSecret = process.env.SUPABASE_JWT_SECRET
  if (!jwtSecret) {
    console.error('[auth] No SUPABASE_JWT_SECRET set — cannot verify token')
    throw new HttpError(401, 'Invalid or expired token')
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret))
    const userId = payload.sub
    if (!userId) throw new HttpError(401, 'Token has no sub claim')

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: { include: { capabilities: true } } } } }
    })
    if (!dbUser) {
      console.error('[auth] JWT fallback: no Prisma user for id:', userId, 'email:', payload.email)
      throw new HttpError(401, 'User not found in database')
    }
    let confirmed = true
    if (dbUser.role === 'student') {
      const { data: au } = await supabaseAdmin.auth.admin.getUserById(userId)
      confirmed = !!au?.user?.email_confirmed_at
    }
    assertAccountUsable(dbUser, confirmed, options)
    return withCapabilities(dbUser)
  } catch (jwtErr) {
    if (jwtErr instanceof HttpError) throw jwtErr
    console.error('[auth] JWT verification failed:', jwtErr)
    throw new HttpError(401, 'Invalid or expired token')
  }
}

/** Attaches the capability list (from roles, unioned with the legacy flags). */
function withCapabilities(
  dbUser: {
    id: string
    email: string
    name: string
    position: string
    role: string
    canManageContent: boolean
    canDelegate: boolean
    canConfigure: boolean
    roles: Array<{ role: { capabilities: Array<{ capability: string }> } }>
  }
): AuthUser {
  const fromRoles = dbUser.roles.flatMap(r => r.role.capabilities.map(c => c.capability)) as Capability[]
  const { roles: _roles, ...rest } = dbUser
  return { ...rest, capabilities: mergeCapabilities(fromRoles, dbUser) }
}

export function requireRole(user: AuthUser, ...roles: string[]) {
  if (!roles.includes(user.role)) {
    throw new HttpError(403, `Access denied. Required role: ${roles.join(' or ')}`)
  }
}

export function requireStaff(user: AuthUser) {
  // legacy role check (super_admin | staff) expressed as a capability
  requireCapability(user, 'staff.access')
}

export function requireSuperAdmin(user: AuthUser) {
  requireCapability(user, 'admin.all')
}

export function requireContentAccess(user: AuthUser) {
  requireCapability(user, 'content.manage')
}

/** Students may only use their own QR/signature flows; block them from officer features. */
export function forbidStudents(user: { role: string }) {
  if (user.role === 'student') {
    throw new HttpError(403, 'Access denied. This feature is for officers only.')
  }
}
