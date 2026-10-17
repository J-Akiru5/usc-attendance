import { HttpError } from './http.js'

export type CheckInMethod = 'self' | 'manual' | 'qr'

export interface Geofence {
  lat: number
  lng: number
  radiusMeters: number
}

export interface Actor {
  id: string
  role: string
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a
    = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function assertWithinGeofence(geofence: Geofence, lat: number, lng: number): void {
  const distance = haversine(lat, lng, geofence.lat, geofence.lng)
  if (distance > geofence.radiusMeters) {
    throw new HttpError(
      403,
      `You are ${Math.round(distance)}m from the venue. Must be within ${geofence.radiusMeters}m to check in.`
    )
  }
}

/** GPS accuracy (metres) we are willing to forgive on top of the venue radius. */
export const MAX_ACCURACY_ALLOWANCE_M = 100

/**
 * The person recording attendance (scanning a QR / delegated manual entry) must be
 * at the venue. Coordinates are required; the venue radius is widened by the
 * device's reported accuracy (capped) so indoor GPS drift does not lock out the door.
 */
export function authorizeScanLocation(
  geofence: Geofence,
  lat: unknown,
  lng: unknown,
  accuracy?: unknown
): { lat: number, lng: number } {
  const la = toNumber(lat)
  const ln = toNumber(lng)
  if (la === null || ln === null || Math.abs(la) > 90 || Math.abs(ln) > 180) {
    throw new HttpError(400, 'Location is required to record attendance. Turn on location and try again.')
  }
  const acc = toNumber(accuracy)
  const allowance = acc === null ? 0 : Math.min(Math.max(acc, 0), MAX_ACCURACY_ALLOWANCE_M)
  const distance = haversine(la, ln, geofence.lat, geofence.lng)
  if (distance > geofence.radiusMeters + allowance) {
    throw new HttpError(
      403,
      `You are ${Math.round(distance)}m from the venue. You must be within ${geofence.radiusMeters}m to record attendance.`
    )
  }
  return { lat: la, lng: ln }
}

export function isStaff(actor: Actor): boolean {
  return actor.role === 'super_admin' || actor.role === 'staff'
}

export function requireStaffRole(actor: Actor): void {
  if (!isStaff(actor)) {
    throw new HttpError(403, 'Access denied. Required role: super_admin or staff')
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

interface SelfCheckInBase {
  actor: Actor
  targetUserId: string
  lat?: unknown
  lng?: unknown
}

/**
 * Self check-in to an event. Requires the caller to target their own account,
 * requires coordinates, and enforces the event geofence — none of it skippable.
 */
export function authorizeEventSelfCheckIn(
  input: SelfCheckInBase & { geofence: Geofence }
): { lat: number, lng: number } {
  if (input.targetUserId !== input.actor.id) {
    throw new HttpError(403, 'Self check-in is for your own account only')
  }
  const lat = toNumber(input.lat)
  const lng = toNumber(input.lng)
  if (lat === null || lng === null) {
    throw new HttpError(400, 'Location (lat, lng) is required for self check-in')
  }
  assertWithinGeofence(input.geofence, lat, lng)
  return { lat, lng }
}

/**
 * Self check-in for duty. Own account only; coordinates optional (the office
 * has no configured geofence) but stored when present.
 */
export function authorizeDutySelfCheckIn(
  input: SelfCheckInBase
): { lat: number | null, lng: number | null } {
  if (input.targetUserId !== input.actor.id) {
    throw new HttpError(403, 'Self check-in is for your own account only')
  }
  return { lat: toNumber(input.lat), lng: toNumber(input.lng) }
}

/** Manual check-in for someone else: staff-only, and never for yourself. */
export function authorizeManualCheckIn(actor: Actor, targetUserId: string): void {
  requireStaffRole(actor)
  if (targetUserId === actor.id) {
    throw new HttpError(
      403,
      'Staff cannot manually record their own attendance. Use self check-in (geolocation) or QR instead.'
    )
  }
}

/** Scanning a member's QR: staff-only, and staff cannot scan their own code. */
export function authorizeQrScan(actor: Actor, tokenUserId: string): void {
  requireStaffRole(actor)
  if (tokenUserId === actor.id) {
    throw new HttpError(403, 'Staff cannot check in with their own QR code')
  }
}
