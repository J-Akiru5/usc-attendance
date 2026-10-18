import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHANNELS,
  channelsFor,
  dedupeKeyFor,
  notifyUser,
  planDelivery,
  type NotifyStore
} from '../../server/utils/notify'

describe('planDelivery', () => {
  it('follows the person\'s choices', () => {
    expect(planDelivery(DEFAULT_CHANNELS)).toEqual(['inApp', 'email'])
    expect(planDelivery({ inApp: true, email: false, push: false })).toEqual(['inApp'])
    expect(planDelivery({ inApp: false, email: true, push: false })).toEqual(['email'])
    expect(planDelivery({ inApp: false, email: false, push: true })).toEqual(['push'])
    expect(planDelivery({ inApp: false, email: false, push: false })).toEqual([])
  })

  it('keeps a kind out of the inbox mail even when email is on', () => {
    expect(planDelivery(DEFAULT_CHANNELS, { emailAllowed: false })).toEqual(['inApp'])
  })
})

describe('dedupeKeyFor', () => {
  it('builds a stable, bounded key', () => {
    expect(dedupeKeyFor('event_reminder', '24:e1')).toBe('event_reminder:24:e1')
    expect(dedupeKeyFor('x', 'y'.repeat(400)).length).toBeLessThanOrEqual(180)
  })
})

/** A tiny store with the handful of methods the notifier uses. */
function fakeStore(prefs: { inApp: boolean, email: boolean, push: boolean } | null, existingKeys: string[] = []) {
  const rows: Array<Record<string, unknown>> = []
  const store: NotifyStore = {
    notificationPreference: { findUnique: async () => prefs },
    notification: {
      create: async ({ data }) => {
        const key = data.dedupeKey as string | null
        if (key && existingKeys.includes(`${data.userId as string}|${key}`)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' })
        }
        const row = { id: `n${rows.length + 1}`, ...data }
        rows.push(row)
        return { id: row.id as string }
      }
    },
    user: { findUnique: async () => ({ email: 'student@example.invalid', name: 'E2E Student' }) }
  }
  return { store, rows }
}

const input = { userId: 'u1', kind: 'registration_confirmed', title: 'You are in', body: 'See you there.' }

describe('notifyUser', () => {
  it('records the row and mails when both channels are on', async () => {
    const { store, rows } = fakeStore(null)
    const mailed: string[] = []
    const mailer = async (to: string): Promise<'sent'> => {
      mailed.push(to)
      return 'sent'
    }
    const result = await notifyUser(store, input, { mailer })
    expect(result).toMatchObject({ channels: ['inApp', 'email'], email: 'sent', duplicate: false })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.channels).toEqual(['inApp', 'email'])
    expect(mailed).toEqual(['student@example.invalid'])
  })

  it('records in the inbox only when email is switched off', async () => {
    const { store, rows } = fakeStore({ inApp: true, email: false, push: false })
    const result = await notifyUser(store, input, { mailer: async () => 'sent' })
    expect(result).toMatchObject({ channels: ['inApp'], email: 'off' })
    expect(rows[0]!.channels).toEqual(['inApp'])
  })

  it('sends the mail but keeps no inbox row when in-app is off', async () => {
    const { store, rows } = fakeStore({ inApp: false, email: true, push: false })
    const result = await notifyUser(store, input, { mailer: async () => 'sent' })
    expect(result).toMatchObject({ channels: ['email'], email: 'sent' })
    expect(rows[0]!.channels).toEqual(['email'])
  })

  it('does nothing at all when every channel is off', async () => {
    const { store, rows } = fakeStore({ inApp: false, email: false, push: false })
    const result = await notifyUser(store, input, { mailer: async () => 'sent' })
    expect(result).toMatchObject({ channels: [], email: 'off', notificationId: null })
    expect(rows).toHaveLength(0)
  })

  it('treats a repeat with the same key as done, not as an error', async () => {
    const { store, rows } = fakeStore(null, ['u1|event_reminder:24:e1'])
    const reminder = { ...input, kind: 'event_reminder', dedupeKey: 'event_reminder:24:e1' }
    const result = await notifyUser(store, reminder, { mailer: async () => 'sent' })
    expect(result).toMatchObject({ duplicate: true, email: 'skipped', notificationId: null })
    expect(rows).toHaveLength(0)
  })

  it('reports a skipped email without losing the inbox row', async () => {
    const { store, rows } = fakeStore(null)
    const result = await notifyUser(store, input, { mailer: async () => 'skipped' })
    expect(result).toMatchObject({ email: 'skipped', duplicate: false })
    expect(rows).toHaveLength(1)
  })
})

describe('channelsFor', () => {
  it('falls back to the defaults for someone who never chose', async () => {
    const { store } = fakeStore(null)
    expect(await channelsFor(store, 'u1')).toEqual(DEFAULT_CHANNELS)
  })

  it('reads the stored choice when there is one', async () => {
    const { store } = fakeStore({ inApp: false, email: true, push: true })
    expect(await channelsFor(store, 'u1')).toEqual({ inApp: false, email: true, push: true })
  })
})
