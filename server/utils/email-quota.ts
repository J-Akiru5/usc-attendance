/**
 * Daily outbound-email guard (plan §11.1): the Resend free plan allows ~100
 * emails a day, and nothing should discover that by failing. Every send is
 * counted (kind + timestamp only, never the recipient) and the sender refuses
 * politely once the day's budget is nearly spent, so the quota stays available
 * for the mail that matters most.
 */
export const DEFAULT_DAILY_LIMIT = 90

/** Resend's daily quota resets on a UTC day, so the counter follows it. */
export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function dailyLimit(): number {
  const raw = Number.parseInt(process.env.RESEND_DAILY_LIMIT ?? '', 10)
  if (Number.isInteger(raw) && raw > 0) return raw
  return DEFAULT_DAILY_LIMIT
}

export interface EmailQuotaStore {
  emailSend: {
    count: (args: { where: { createdAt: { gte: Date } } }) => Promise<number>
    create: (args: { data: { kind: string, createdAt: Date } }) => Promise<unknown>
  }
}

export interface EmailQuota {
  count: number
  limit: number
  remaining: number
  exceeded: boolean
  dayStart: string
}

export async function emailQuota(db: EmailQuotaStore, now: Date = new Date()): Promise<EmailQuota> {
  const dayStart = utcDayStart(now)
  const limit = dailyLimit()
  const count = await db.emailSend.count({ where: { createdAt: { gte: dayStart } } })
  const remaining = Math.max(0, limit - count)
  return { count, limit, remaining, exceeded: remaining <= 0, dayStart: dayStart.toISOString() }
}

export async function recordEmailSend(db: EmailQuotaStore, kind: string, now: Date = new Date()): Promise<void> {
  await db.emailSend.create({ data: { kind, createdAt: now } })
}
