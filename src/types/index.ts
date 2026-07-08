export type Role = 'super_admin' | 'staff' | 'client'

export type AttendanceType = 'event' | 'duty'
export type CheckInMethod = 'self' | 'manual' | 'qr'

export interface User {
  id: string
  email: string
  name: string
  position: string
  role: Role
  createdAt: string
}

export interface USCEvent {
  id: string
  title: string
  date: string
  lat: number
  lng: number
  radiusMeters: number
  createdBy: string
  creator?: User
  attendance?: Attendance[]
  createdAt: string
}

export interface Attendance {
  id: string
  type: AttendanceType
  eventId: string | null
  dutyDate: string | null
  userId: string
  method: CheckInMethod
  lat: number | null
  lng: number | null
  recordedBy: string
  createdAt: string
  event?: USCEvent
  user?: User
  recorder?: User
}

export interface CheckInPayload {
  type: AttendanceType
  eventId?: string
  dutyDate?: string
  userId: string
  method: CheckInMethod
  lat?: number
  lng?: number
  recordedBy: string
}

export interface OfflineCheckIn extends CheckInPayload {
  id: string
  synced: boolean
  createdAt: string
}

export interface OfficeDuty {
  id: string
  userId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  active: boolean
  user?: User
}

export interface QRToken {
  userId: string
  eventId: string
  issuedAt: number
  exp: number
  sig: string
}
