import { describe, expect, it } from 'vitest'
import {
  cancelRegistration,
  initialStatus,
  registerForEvent,
  seatsLeft,
  waitlistPositionOf,
  type RegistrationRow,
  type RegistrationStore
} from '../../server/utils/registrations'

/** In-memory store with the handful of queries the rules use, in the same shape. */
function fakeStore(seed: Array<Partial<RegistrationRow> & { eventId: string, userId: string, status: string }> = []) {
  const rows: RegistrationRow[] = seed.map((row, index) => ({
    id: row.id ?? `r${index}`,
    eventId: row.eventId,
    userId: row.userId,
    status: row.status,
    createdAt: row.createdAt ?? new Date(2026, 0, index + 1),
    promotedAt: row.promotedAt ?? null
  }))

  const store: RegistrationStore = {
    eventRegistration: {
      count: async ({ where }) => rows.filter(r => r.eventId === where.eventId && r.status === where.status).length,
      findUnique: async ({ where }) => rows.find(r => r.eventId === where.eventId_userId.eventId && r.userId === where.eventId_userId.userId) ?? null,
      findFirst: async ({ where }) => rows
        .filter(r => r.eventId === where.eventId && r.status === where.status)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null,
      create: async ({ data }) => {
        const row: RegistrationRow = {
          id: `r${rows.length}`,
          eventId: data.eventId,
          userId: data.userId,
          status: data.status,
          createdAt: new Date(2026, 5, rows.length + 1),
          promotedAt: data.promotedAt ?? null
        }
        rows.push(row)
        return row
      },
      update: async ({ where, data }) => {
        const row = rows.find(r => r.id === where.id)!
        Object.assign(row, data)
        return row
      },
      findMany: async ({ where }) => {
        let out = rows
        if (where.eventId) out = out.filter(r => r.eventId === where.eventId)
        if (where.userId) out = out.filter(r => r.userId === where.userId)
        if (where.status) out = out.filter(r => r.status === where.status)
        return [...out].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      }
    }
  }
  return { store, rows }
}

describe('seatsLeft / initialStatus', () => {
  it('treats a missing capacity as unlimited', () => {
    expect(seatsLeft(null, 500)).toBeNull()
    expect(seatsLeft(undefined, 0)).toBeNull()
    expect(initialStatus(null)).toBe('registered')
  })

  it('counts down and never goes negative', () => {
    expect(seatsLeft(10, 4)).toBe(6)
    expect(seatsLeft(10, 10)).toBe(0)
    expect(seatsLeft(10, 12)).toBe(0)
  })

  it('waitlists only when the last seat is gone', () => {
    expect(initialStatus(1)).toBe('registered')
    expect(initialStatus(0)).toBe('waitlisted')
  })
})

describe('registerForEvent', () => {
  it('takes a seat while there is one', async () => {
    const { store, rows } = fakeStore()
    const result = await registerForEvent(store, { eventId: 'e1', userId: 'u1', capacity: 2 })
    expect(result).toEqual({ status: 'registered', position: null })
    expect(rows[0]).toMatchObject({ userId: 'u1', status: 'registered' })
  })

  it('waitlists once the event is full, in arrival order', async () => {
    const { store } = fakeStore([
      { eventId: 'e1', userId: 'a', status: 'registered' },
      { eventId: 'e1', userId: 'b', status: 'registered' }
    ])
    const third = await registerForEvent(store, { eventId: 'e1', userId: 'c', capacity: 2 })
    const fourth = await registerForEvent(store, { eventId: 'e1', userId: 'd', capacity: 2 })
    expect(third).toEqual({ status: 'waitlisted', position: 1 })
    expect(fourth).toEqual({ status: 'waitlisted', position: 2 })
  })

  it('never double-books someone already holding a place', async () => {
    const { store, rows } = fakeStore([{ eventId: 'e1', userId: 'a', status: 'registered' }])
    const result = await registerForEvent(store, { eventId: 'e1', userId: 'a', capacity: 5 })
    expect(result).toEqual({ status: 'registered', position: null })
    expect(rows).toHaveLength(1)
  })

  it('lets a cancelled person rejoin at the back of the queue', async () => {
    const { store } = fakeStore([
      { eventId: 'e1', userId: 'a', status: 'registered' },
      { eventId: 'e1', userId: 'b', status: 'waitlisted', createdAt: new Date(2026, 2, 1) },
      { eventId: 'e1', userId: 'c', status: 'cancelled' }
    ])
    const again = await registerForEvent(store, { eventId: 'e1', userId: 'c', capacity: 1 })
    expect(again.status).toBe('waitlisted')
    expect(again.position).toBe(2) // behind b, who has been waiting longer
  })
})

describe('waitlistPositionOf', () => {
  it('is 1-based and null for someone not in the queue', async () => {
    const { store } = fakeStore([
      { eventId: 'e1', userId: 'x', status: 'waitlisted', createdAt: new Date(2026, 0, 1) },
      { eventId: 'e1', userId: 'y', status: 'waitlisted', createdAt: new Date(2026, 0, 2) }
    ])
    expect(await waitlistPositionOf(store, 'e1', 'x')).toBe(1)
    expect(await waitlistPositionOf(store, 'e1', 'y')).toBe(2)
    expect(await waitlistPositionOf(store, 'e1', 'z')).toBeNull()
  })
})

describe('cancelRegistration', () => {
  it('promotes the longest-waiting person when a seat frees', async () => {
    const { store, rows } = fakeStore([
      { eventId: 'e1', userId: 'a', status: 'registered' },
      { eventId: 'e1', userId: 'b', status: 'waitlisted', createdAt: new Date(2026, 1, 1) },
      { eventId: 'e1', userId: 'c', status: 'waitlisted', createdAt: new Date(2026, 1, 2) }
    ])
    const result = await cancelRegistration(store, { eventId: 'e1', userId: 'a', capacity: 1 })
    expect(result).toEqual({ cancelled: true, promotedUserId: 'b' })
    expect(rows.find(r => r.userId === 'a')!.status).toBe('cancelled')
    expect(rows.find(r => r.userId === 'b')!).toMatchObject({ status: 'registered' })
    expect(rows.find(r => r.userId === 'b')!.promotedAt).toBeInstanceOf(Date)
    expect(rows.find(r => r.userId === 'c')!.status).toBe('waitlisted')
  })

  it('leaving the queue promotes nobody', async () => {
    const { store } = fakeStore([
      { eventId: 'e1', userId: 'a', status: 'registered' },
      { eventId: 'e1', userId: 'b', status: 'waitlisted' }
    ])
    const result = await cancelRegistration(store, { eventId: 'e1', userId: 'b', capacity: 1 })
    expect(result).toEqual({ cancelled: true, promotedUserId: null })
  })

  it('does nothing for someone who was never registered', async () => {
    const { store } = fakeStore()
    expect(await cancelRegistration(store, { eventId: 'e1', userId: 'ghost', capacity: 1 }))
      .toEqual({ cancelled: false, promotedUserId: null })
  })

  it('is idempotent: cancelling twice promotes at most one person', async () => {
    const { store } = fakeStore([
      { eventId: 'e1', userId: 'a', status: 'registered' },
      { eventId: 'e1', userId: 'b', status: 'waitlisted' }
    ])
    await cancelRegistration(store, { eventId: 'e1', userId: 'a', capacity: 1 })
    const second = await cancelRegistration(store, { eventId: 'e1', userId: 'a', capacity: 1 })
    expect(second).toEqual({ cancelled: false, promotedUserId: null })
  })
})
