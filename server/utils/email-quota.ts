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

/**
 * The quota as the officer-facing preview may show it. A counter that could not
 * be read is `known: false` with no numbers at all — never a plausible-looking
 * zero that would read as "the budget is spent".
 */
export interface EmailQuotaView {
  known: boolean
  used: number | null
  limit: number | null
  remaining: number | null
  exceeded: boolean | null
  dayStart: string | null
}

export function quotaView(quota: EmailQuota | null): EmailQuotaView {
  if (!quota) {
    return { known: false, used: null, limit: null, remaining: null, exceeded: null, dayStart: null }
  }
  return {
    known: true,
    used: quota.count,
    limit: quota.limit,
    remaining: quota.remaining,
    exceeded: quota.exceeded,
    dayStart: quota.dayStart
  }
}

/**
 * Reads the counter without letting a database hiccup turn into a 500 on a
 * preview screen. `null` means "unknown", and callers must say so rather than
 * guess.
 */
export async function tryEmailQuota(db: EmailQuotaStore, now: Date = new Date()): Promise<EmailQuota | null> {
  try {
    return await emailQuota(db, now)
  } catch {
    console.warn('[email-quota] the day\'s counter could not be read; reporting unknown')
    return null
  }
}

export type EmailBudgetState = 'fits' | 'over_budget' | 'unknown'

export interface EmailBudgetDecision {
  state: EmailBudgetState
  /** True only when the whole audience can be emailed within today's budget. */
  allowed: boolean
  /** The audience size the decision was made for (a count, never a list). */
  recipients: number
  remaining: number | null
  limit: number | null
  /** A plain sentence for the officer; null when the send fits. */
  message: string | null
}

/**
 * BC-12: one decision, shared by the preview and both send paths. `recipients`
 * is the full resolved audience — an upper bound on the mails, since a person
 * may have email switched off — so the guard errs towards refusing rather than
 * towards silently dropping the tail of an audience once the quota runs out.
 *
 * An unreadable counter refuses too: email is opt-in, and the in-app inbox
 * still works, so a temporary inability to count must not spend an unknown
 * amount of the day's budget.
 */
export function emailBudgetDecision(recipients: number, quota: EmailQuota | null): EmailBudgetDecision {
  const wanted = Number.isFinite(recipients) ? Math.max(0, Math.floor(recipients)) : 0

  if (!quota) {
    return {
      state: 'unknown',
      allowed: false,
      recipients: wanted,
      remaining: null,
      limit: null,
      message: `That would email ${wanted} people, but today's email budget could not be checked. Send it in-app only, or try again in a moment.`
    }
  }

  if (wanted <= quota.remaining) {
    return {
      state: 'fits',
      allowed: true,
      recipients: wanted,
      remaining: quota.remaining,
      limit: quota.limit,
      message: null
    }
  }

  return {
    state: 'over_budget',
    allowed: false,
    recipients: wanted,
    remaining: quota.remaining,
    limit: quota.limit,
    message: `That would email ${wanted} people, but only ${quota.remaining} of today's ${quota.limit} emails are left. Send it in-app only, or email it tomorrow.`
  }
}

export async function recordEmailSend(db: EmailQuotaStore, kind: string, now: Date = new Date()): Promise<void> {
  await db.emailSend.create({ data: { kind, createdAt: now } })
}
