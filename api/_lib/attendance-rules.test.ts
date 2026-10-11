import { describe, expect, it } from 'vitest'
import { HttpError } from './http.js'
import {
  assertWithinGeofence,
  authorizeDutySelfCheckIn,
  authorizeEventSelfCheckIn,
  authorizeManualCheckIn,
  authorizeQrScan,
  haversine,
  isStaff,
  requireStaffRole,
  type Actor,
} from './attendance-rules.js'

const officer: Actor = { id: 'user-officer', role: 'client' }
const staff: Actor = { id: 'user-staff', role: 'staff' }
const superAdmin: Actor = { id: 'user-admin', role: 'super_admin' }

// ISUFST Dingle Campus-ish coordinates
const venue = { lat: 10.7202, lng: 122.5621, radiusMeters: 50 }

function expectHttpError(fn: () => unknown, status: number, messagePart?: string) {
  try {
    fn()
    expect.unreachable('expected HttpError to be thrown')
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(status)
    if (messagePart) {
      expect((err as HttpError).message).toContain(messagePart)
    }
  }
}

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine(10.7202, 122.5621, 10.7202, 122.5621)).toBe(0)
  })

  it('returns ~111.2m for 0.001 degrees of latitude', () => {
    const d = haversine(10.7202, 122.5621, 10.7212, 122.5621)
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('assertWithinGeofence', () => {
  it('allows a point inside the radius', () => {
    expect(() => assertWithinGeofence(venue, 10.7202, 122.5621)).not.toThrow()
  })

  it('rejects a point outside the radius with 403', () => {
    // ~0.01 degrees north ≈ 1.1km away
    expectHttpError(
      () => assertWithinGeofence(venue, 10.7302, 122.5621),
      403,
      'Must be within 50m'
    )
  })
})

describe('authorizeEventSelfCheckIn (F1)', () => {
  it('allows checking in your own account inside the geofence', () => {
    const result = authorizeEventSelfCheckIn({
      actor: officer,
      targetUserId: officer.id,
      lat: 10.7202,
      lng: 122.5621,
      geofence: venue,
    })
    expect(result).toEqual({ lat: 10.7202, lng: 122.5621 })
  })

  it('rejects impersonating another user with 403', () => {
    expectHttpError(
      () =>
        authorizeEventSelfCheckIn({
          actor: officer,
          targetUserId: 'user-victim',
          lat: 10.7202,
          lng: 122.5621,
          geofence: venue,
        }),
      403,
      'your own account'
    )
  })

  it('rejects missing coordinates with 400 — the skippable-geofence bug', () => {
    expectHttpError(
      () =>
        authorizeEventSelfCheckIn({
          actor: officer,
          targetUserId: officer.id,
          geofence: venue,
        }),
      400,
      'Location'
    )
  })

  it('rejects string "undefined" coordinates with 400', () => {
    expectHttpError(
      () =>
        authorizeEventSelfCheckIn({
          actor: officer,
          targetUserId: officer.id,
          lat: undefined,
          lng: undefined,
          geofence: venue,
        }),
      400
    )
  })

  it('rejects coordinates outside the geofence with 403', () => {
    expectHttpError(
      () =>
        authorizeEventSelfCheckIn({
          actor: officer,
          targetUserId: officer.id,
          lat: 10.7302,
          lng: 122.5621,
          geofence: venue,
        }),
      403,
      'Must be within 50m'
    )
  })

  it('accepts numeric strings (form-encoded bodies)', () => {
    const result = authorizeEventSelfCheckIn({
      actor: officer,
      targetUserId: officer.id,
      lat: '10.7202',
      lng: '122.5621',
      geofence: venue,
    })
    expect(result).toEqual({ lat: 10.7202, lng: 122.5621 })
  })
})

describe('authorizeDutySelfCheckIn', () => {
  it('allows checking in your own account', () => {
    const result = authorizeDutySelfCheckIn({
      actor: officer,
      targetUserId: officer.id,
    })
    expect(result).toEqual({ lat: null, lng: null })
  })

  it('rejects impersonating another user with 403', () => {
    expectHttpError(
      () => authorizeDutySelfCheckIn({ actor: officer, targetUserId: 'user-victim' }),
      403,
      'your own account'
    )
  })

  it('passes through coordinates when present', () => {
    const result = authorizeDutySelfCheckIn({
      actor: officer,
      targetUserId: officer.id,
      lat: 10.7202,
      lng: 122.5621,
    })
    expect(result).toEqual({ lat: 10.7202, lng: 122.5621 })
  })
})

describe('authorizeManualCheckIn (F2)', () => {
  it('allows staff to record another user', () => {
    expect(() => authorizeManualCheckIn(staff, 'user-officer')).not.toThrow()
    expect(() => authorizeManualCheckIn(superAdmin, 'user-officer')).not.toThrow()
  })

  it('rejects a non-staff recorder with 403', () => {
    expectHttpError(
      () => authorizeManualCheckIn(officer, 'user-victim'),
      403,
      'Required role'
    )
  })

  it('rejects staff recording their own attendance with 403', () => {
    expectHttpError(
      () => authorizeManualCheckIn(staff, staff.id),
      403,
      'cannot manually record their own'
    )
  })
})

describe('authorizeQrScan (F6)', () => {
  it('allows staff to scan another user\'s token', () => {
    expect(() => authorizeQrScan(staff, 'user-officer')).not.toThrow()
  })

  it('rejects a non-staff scanner with 403', () => {
    expectHttpError(() => authorizeQrScan(officer, 'user-officer'), 403)
  })

  it('rejects staff scanning their own QR with 403 — the self-scan bypass', () => {
    expectHttpError(
      () => authorizeQrScan(staff, staff.id),
      403,
      'own QR code'
    )
  })
})

describe('isStaff / requireStaffRole', () => {
  it('treats staff and super_admin as staff, client as not', () => {
    expect(isStaff(staff)).toBe(true)
    expect(isStaff(superAdmin)).toBe(true)
    expect(isStaff(officer)).toBe(false)
  })

  it('requireStaffRole throws 403 for client', () => {
    expectHttpError(() => requireStaffRole(officer), 403)
  })
})
