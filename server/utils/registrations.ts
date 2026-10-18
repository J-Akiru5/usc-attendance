/**
 * Event registration rules (plan §8.2): capacity + first-come-first-served
 * waitlist with automatic promotion when someone cancels.
 *
 * The rules are pure and the store is injected, so the queue behaviour is
 * unit-tested without a database; the routes are thin wrappers over these.
 */
export type RegistrationStatus = 'registered' | 'waitlisted' | 'cancelled'

export interface RegistrationRow {
  id: string
  eventId: string
  userId: string
  status: string
  createdAt: Date
  promotedAt?: Date | null
}

export interface RegistrationStore {
  eventRegistration: {
    count: (args: { where: { eventId: string, status: string } }) => Promise<number>
    findUnique: (args: { where: { eventId_userId: { eventId: string, userId: string } } }) => Promise<RegistrationRow | null>
    findFirst: (args: { where: { eventId: string, status: string }, orderBy: { createdAt: 'asc' } }) => Promise<RegistrationRow | null>
    create: (args: { data: { eventId: string, userId: string, status: RegistrationStatus, promotedAt?: Date | null, createdAt?: Date } }) => Promise<RegistrationRow>
    update: (args: { where: { id: string }, data: Partial<Pick<RegistrationRow, 'status' | 'promotedAt' | 'createdAt'>> }) => Promise<RegistrationRow>
    findMany: (args: {
      where: { eventId?: string, userId?: string, status?: string }
      orderBy?: { createdAt: 'asc' | 'desc' }
    }) => Promise<RegistrationRow[]>
  }
}

/** Seats left, or null when the event has no capacity limit. */
export function seatsLeft(capacity: number | null | undefined, registeredCount: number): number | null {
  if (capacity === null || capacity === undefined) return null
  return Math.max(0, capacity - registeredCount)
}

/** Where a new registration lands: a seat if there is one, otherwise the queue. */
export function initialStatus(seats: number | null): RegistrationStatus {
  if (seats === null) return 'registered'
  return seats > 0 ? 'registered' : 'waitlisted'
}

export interface RegisterResult {
  status: RegistrationStatus
  /** 1-based place in the waitlist, when waitlisted. */
  position: number | null
}

export async function registerForEvent(
  store: RegistrationStore,
  input: { eventId: string, userId: string, capacity: number | null },
  now: Date = new Date()
): Promise<RegisterResult> {
  const existing = await store.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: input.eventId, userId: input.userId } }
  })

  const registeredCount = await store.eventRegistration.count({
    where: { eventId: input.eventId, status: 'registered' }
  })
  const seats = seatsLeft(input.capacity, registeredCount)

  if (existing) {
    // Re-registering after cancelling reuses the row but takes the back of the
    // queue: the joining time is what the waitlist orders by.
    if (existing.status !== 'cancelled') {
      return { status: existing.status as RegistrationStatus, position: null }
    }
    const status = initialStatus(seats)
    await store.eventRegistration.update({
      where: { id: existing.id },
      data: { status, createdAt: now, promotedAt: status === 'registered' ? now : null }
    })
    return { status, position: status === 'waitlisted' ? await waitlistPositionOf(store, input.eventId, input.userId) : null }
  }

  const status = initialStatus(seats)
  const created = await store.eventRegistration.create({
    data: { eventId: input.eventId, userId: input.userId, status, createdAt: now, promotedAt: status === 'registered' ? now : null }
  })
  return { status, position: status === 'waitlisted' ? await waitlistPositionOf(store, input.eventId, created.userId) : null }
}

export async function waitlistPositionOf(store: RegistrationStore, eventId: string, userId: string): Promise<number | null> {
  const waiting = await store.eventRegistration.findMany({
    where: { eventId, status: 'waitlisted' },
    orderBy: { createdAt: 'asc' }
  })
  const index = waiting.findIndex(row => row.userId === userId)
  return index === -1 ? null : index + 1
}

export interface CancelResult {
  cancelled: boolean
  /** Whoever moved up from the waitlist, if anyone. */
  promotedUserId: string | null
}

export async function cancelRegistration(
  store: RegistrationStore,
  input: { eventId: string, userId: string, capacity: number | null },
  now: Date = new Date()
): Promise<CancelResult> {
  const existing = await store.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: input.eventId, userId: input.userId } }
  })
  if (!existing || existing.status === 'cancelled') return { cancelled: false, promotedUserId: null }

  const wasRegistered = existing.status === 'registered'
  await store.eventRegistration.update({ where: { id: existing.id }, data: { status: 'cancelled', promotedAt: null } })

  // Only freeing a seat promotes someone; leaving the queue does not.
  if (!wasRegistered) return { cancelled: true, promotedUserId: null }

  const next = await store.eventRegistration.findFirst({
    where: { eventId: input.eventId, status: 'waitlisted' },
    orderBy: { createdAt: 'asc' }
  })
  if (!next) return { cancelled: true, promotedUserId: null }

  await store.eventRegistration.update({ where: { id: next.id }, data: { status: 'registered', promotedAt: now } })
  return { cancelled: true, promotedUserId: next.userId }
}
