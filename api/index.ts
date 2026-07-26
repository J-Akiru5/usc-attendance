import type { VercelRequest, VercelResponse } from '@vercel/node'

import * as attendance from './_handlers/attendance.js'
import * as auth from './_handlers/auth.js'
import * as cms from './_handlers/cms.js'
import * as contact from './_handlers/contact.js'
import * as duties from './_handlers/duties.js'
import * as events from './_handlers/events.js'
import * as orgProfile from './_handlers/org-profile.js'
import * as photos from './_handlers/photos.js'

/**
 * Single catch-all Vercel serverless function.
 *
 * All /api/** requests are rewritten here by vercel.json. This router parses
 * the URL path and dispatches to the correct handler, keeping the project
 * within the Hobby plan's 12-function limit.
 *
 * Route table (most-specific first to avoid false matches):
 *   /api/attendance/export   → attendance.exportCsv
 *   /api/attendance/checkout → attendance.checkout
 *   /api/attendance/duty     → attendance.duty
 *   /api/attendance/qr       → attendance.qr
 *   /api/attendance          → attendance.index
 *   /api/auth/me             → auth.me
 *   /api/auth/profile        → auth.users  (PUT alias used by the frontend store)
 *   /api/auth/users/:id      → auth.userById
 *   /api/auth/users          → auth.users
 *   /api/cms/content         → cms.content
 *   /api/cms/events          → cms.events
 *   /api/cms/officers        → cms.officers
 *   /api/cms/projects        → cms.projects
 *   /api/contact             → contact.contact
 *   /api/duties              → duties.duties
 *   /api/events/:id          → events.eventById
 *   /api/events              → events.events
 *   /api/org-profile         → orgProfile.orgProfile
 *   /api/photos/presign      → photos.presign
 *   /api/photos              → photos.photos
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }

  // Strip query string and trailing slash, then normalise
  const rawPath = (req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/'

  // ---------------------------------------------------------------------------
  // Attendance routes (most specific first)
  // ---------------------------------------------------------------------------
  if (rawPath === '/api/attendance/export') return attendance.exportCsv(req, res)
  if (rawPath === '/api/attendance/checkout') return attendance.checkout(req, res)
  if (rawPath === '/api/attendance/duty') return attendance.duty(req, res)
  if (rawPath === '/api/attendance/qr') return attendance.qr(req, res)
  if (rawPath === '/api/attendance') return attendance.index(req, res)

  // ---------------------------------------------------------------------------
  // Auth routes
  // ---------------------------------------------------------------------------
  if (rawPath === '/api/auth/me') return auth.me(req, res)
  // /api/auth/profile is used by the frontend store for PUT (own profile update)
  if (rawPath === '/api/auth/profile') return auth.users(req, res)
  // /api/auth/users/:id — dynamic segment
  const usersIdMatch = rawPath.match(/^\/api\/auth\/users\/([^/]+)$/)
  if (usersIdMatch) return auth.userById(req, res, usersIdMatch[1])
  if (rawPath === '/api/auth/users') return auth.users(req, res)

  // ---------------------------------------------------------------------------
  // CMS routes (public, no auth required in handlers)
  // ---------------------------------------------------------------------------
  if (rawPath === '/api/cms/content') return cms.content(req, res)
  if (rawPath === '/api/cms/events') return cms.events(req, res)
  if (rawPath === '/api/cms/officers') return cms.officers(req, res)
  if (rawPath === '/api/cms/projects') return cms.projects(req, res)

  // ---------------------------------------------------------------------------
  // Contact
  // ---------------------------------------------------------------------------
  if (rawPath === '/api/contact') return contact.contact(req, res)

  // ---------------------------------------------------------------------------
  // Duties
  // ---------------------------------------------------------------------------
  if (rawPath === '/api/duties') return duties.duties(req, res)

  // ---------------------------------------------------------------------------
  // Events routes
  // ---------------------------------------------------------------------------
  // /api/events/:id — dynamic segment (must come before /api/events)
  const eventsIdMatch = rawPath.match(/^\/api\/events\/([^/]+)$/)
  if (eventsIdMatch) return events.eventById(req, res, eventsIdMatch[1])
  if (rawPath === '/api/events') return events.events(req, res)

  // ---------------------------------------------------------------------------
  // Org-profile
  // ---------------------------------------------------------------------------
  if (rawPath === '/api/org-profile') return orgProfile.orgProfile(req, res)

  // ---------------------------------------------------------------------------
  // Photos routes (presign before photos to avoid prefix match issues)
  // ---------------------------------------------------------------------------
  if (rawPath === '/api/photos/presign') return photos.presign(req, res)
  if (rawPath === '/api/photos') return photos.photos(req, res)

  // ---------------------------------------------------------------------------
  // No route matched
  // ---------------------------------------------------------------------------
  return res.status(404).json({ error: `API route not found: ${rawPath}` })
}
