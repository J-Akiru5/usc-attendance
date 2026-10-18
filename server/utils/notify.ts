import type { PrismaClient } from '@prisma/client'
import { sendEmail } from './resend'

/**
 * Notifications (plan §8.4). One place decides what a person receives, so the
 * automatic kinds (registration confirmed, waitlist promotion, reminders) and
 * the announcements to come all behave the same way: the row is always written —
 * that is what makes a re-run of the reminder cron safe and what an audit would
 * read — while the *channels* recorded say how it actually went out.
 *
 * Web push waits for the PWA service worker; the `push` preference is stored now
 * so the choice is not lost when it lands.
 */
export type Channel = 'inApp' | 'email' | 'push'

export interface NotificationChannels {
  inApp: boolean
  email: boolean
  push: boolean
}

export const DEFAULT_CHANNELS: NotificationChannels = { inApp: true, email: true, push: false }

export interface NotifyInput {
  userId: string
  kind: string
  title: string
  body: string
  link?: string | null
  /** Same key twice for one user means one notification (the cron relies on it). */
  dedupeKey?: string | null
  /** False for kinds that must never leave the app. */
  emailAllowed?: boolean
  createdBy?: string | null
}

/** Which channels a notification rides, given the person's choices. */
export function planDelivery(channels: NotificationChannels, input: { emailAllowed?: boolean } = {}): Channel[] {
  const plan: Channel[] = []
  if (channels.inApp) plan.push('inApp')
  if (channels.email && input.emailAllowed !== false) plan.push('email')
  if (channels.push) plan.push('push')
  return plan
}

/** A stable key for "this thing, for this person, for this window". */
export function dedupeKeyFor(kind: string, scope: string): string {
  return `${kind}:${scope}`.slice(0, 180)
}

export interface NotifyStore {
  notificationPreference: {
    findUnique: (args: { where: { userId: string } }) => Promise<{ inApp: boolean, email: boolean, push: boolean } | null>
  }
  notification: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>
  }
  user: {
    findUnique: (args: { where: { id: string }, select: { email: true, name: true } }) => Promise<{ email: string, name: string | null } | null>
  }
}

export async function channelsFor(db: NotifyStore, userId: string): Promise<NotificationChannels> {
  const row = await db.notificationPreference.findUnique({ where: { userId } })
  if (!row) return { ...DEFAULT_CHANNELS }
  return { inApp: row.inApp, email: row.email, push: row.push }
}

export type EmailOutcome = 'sent' | 'off' | 'skipped' | 'failed'

export interface NotifyResult {
  /** How it was recorded; empty when the person has every channel switched off. */
  channels: Channel[]
  notificationId: string | null
  email: EmailOutcome
  /** True when this exact notification already existed (cron re-runs). */
  duplicate: boolean
}

export interface NotifyDeps {
  mailer?: (to: string, subject: string, text: string) => Promise<EmailOutcome>
}

async function defaultMailer(to: string, subject: string, text: string): Promise<EmailOutcome> {
  const result = await sendEmail('notification', {
    from: process.env.RESEND_FROM_EMAIL ?? 'USC Attendance <no-reply@usc.edu.ph>',
    to,
    subject,
    text
  })
  if (result.skipped) return 'skipped'
  if (result.error) return 'failed'
  return 'sent'
}

/**
 * Records a notification for one person and sends the email when their choices
 * allow it. Never throws for a duplicate: a second identical dispatch is a no-op.
 */
export async function notifyUser(
  db: NotifyStore,
  input: NotifyInput,
  deps: NotifyDeps = {}
): Promise<NotifyResult> {
  const channels = await channelsFor(db, input.userId)
  const plan = planDelivery(channels, { emailAllowed: input.emailAllowed })

  if (plan.length === 0) {
    return { channels: [], notificationId: null, email: 'off', duplicate: false }
  }

  let notificationId: string
  try {
    const row = await db.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
        channels: plan,
        createdBy: input.createdBy ?? null
      }
    })
    notificationId = row.id
  } catch (error) {
    // The unique (userId, dedupeKey) index: this person already has this one.
    if (isUniqueViolation(error)) {
      return { channels: plan, notificationId: null, email: 'skipped', duplicate: true }
    }
    throw error
  }

  if (!plan.includes('email')) {
    return { channels: plan, notificationId, email: 'off', duplicate: false }
  }

  const user = await db.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true } })
  if (!user) {
    return { channels: plan, notificationId, email: 'failed', duplicate: false }
  }

  const mailer = deps.mailer ?? defaultMailer
  const email = await mailer(user.email, input.title, input.body)
  return { channels: plan, notificationId, email, duplicate: false }
}

/** The same, for a list of people (announcements and reminders use this). */
export async function notifyMany(
  db: NotifyStore,
  inputs: NotifyInput[],
  deps: NotifyDeps = {}
): Promise<{ sent: number, duplicates: number, emails: number }> {
  let sent = 0
  let duplicates = 0
  let emails = 0
  for (const input of inputs) {
    const result = await notifyUser(db, input, deps)
    if (result.duplicate) duplicates++
    else if (result.notificationId) sent++
    if (result.email === 'sent') emails++
  }
  return { sent, duplicates, emails }
}

/** Prisma's P2002, without importing the error class into every caller. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

/** Convenience for routes that hold the full client. */
export function notifier(prisma: PrismaClient): NotifyStore {
  return prisma as unknown as NotifyStore
}
