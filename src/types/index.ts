export type Role = 'super_admin' | 'staff' | 'client'

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
  eventId: string
  userId: string
  method: 'self' | 'manual'
  lat: number | null
  lng: number | null
  recordedBy: string
  createdAt: string
  event?: USCEvent
  user?: User
  recorder?: User
}

export interface CheckInPayload {
  eventId: string
  userId: string
  method: 'self' | 'manual'
  lat?: number
  lng?: number
  recordedBy: string
}

export interface OfflineCheckIn extends CheckInPayload {
  id: string
  synced: boolean
  createdAt: string
}
