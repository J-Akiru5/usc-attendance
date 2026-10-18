import type { PrismaClient } from '@prisma/client'
import { dedupeKeyFor, notifyMany, notifier } from './notify'
import { resolveAudience, specFromEvent } from './audience'

/**
 * Announcements (plan §8.4): compose, target, schedule, pin. The body is a
 * deliberately small markdown subset — paragraphs, **bold**, *italic*,
 * [links](https://…) and `-` lists — rendered by the function below, which
 * escapes every character of user text *before* turning tokens into tags. That
 * ordering is what makes it safe: nothing a person types can become a tag, and
 * only http(s) links survive.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only an ordinary web link, please. */
export function safeHref(url: string): string | null {
  const trimmed = url.trim()
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(trimmed)) return null
  return trimmed
}

function inline(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  html = html.replace(/(^|[^_\w])_([^_\s][^_]*)_/g, '$1<em>$2</em>')
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    const href = safeHref(url)
    if (!href) return match
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
  return html
}

/** The whole body: paragraphs, `-` lists, single newlines as line breaks. */
export function renderAnnouncementBody(markdown: string): string {
  const blocks = String(markdown ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/)
  const parts: string[] = []

  for (const block of blocks) {
    const lines = block.split('\n').filter(line => line.trim().length > 0)
    if (lines.length === 0) continue

    if (lines.every(line => /^[-*]\s+/.test(line.trim()))) {
      const items = lines.map(line => `<li>${inline(line.trim().replace(/^[-*]\s+/, ''))}</li>`).join('')
      parts.push(`<ul>${items}</ul>`)
      continue
    }

    parts.push(`<p>${lines.map(inline).join('<br>')}</p>`)
  }

  return parts.join('\n')
}

/** A plain-text version for the inbox and the email. */
export function plainAnnouncementBody(markdown: string): string {
  return String(markdown ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/\r\n/g, '\n')
    .trim()
}

export type AnnouncementStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled'

/** What a save means: send it now, leave it for its time, or keep it a draft. */
export function deriveStatus(input: { sendNow?: boolean, scheduledFor?: Date | null }): AnnouncementStatus {
  if (input.sendNow) return 'sent'
  if (input.scheduledFor) return 'scheduled'
  return 'draft'
}

/** Scheduled announcements whose time has come (the cron sends exactly these). */
export function dueAnnouncements<T extends { status: string, scheduledFor: Date | null }>(rows: T[], now: Date = new Date()): T[] {
  return rows.filter(row => row.status === 'scheduled' && row.scheduledFor !== null && row.scheduledFor.getTime() <= now.getTime())
}

export interface DispatchResult {
  recipients: number
  sent: number
  duplicates: number
  emails: number
}

/**
 * Delivers one announcement through the notification core and stamps it sent.
 * Idempotent: every recipient's notification carries `announcement:<id>`, so a
 * second run (or a cron retry) reports duplicates instead of sending again.
 */
export async function dispatchAnnouncement(
  db: PrismaClient,
  row: {
    id: string
    title: string
    body: string
    audienceType: string
    audienceCollegeId: string | null
    audienceYearLevel: number | null
    audienceSectionId: string | null
  },
  now: Date = new Date()
): Promise<DispatchResult> {
  const recipients = await resolveAudience(db, specFromEvent(row))
  const text = plainAnnouncementBody(row.body)

  const result = recipients.length === 0
    ? { sent: 0, duplicates: 0, emails: 0 }
    : await notifyMany(notifier(db), recipients.map(userId => ({
        userId,
        kind: 'announcement',
        title: row.title,
        body: text,
        link: '/notifications',
        dedupeKey: dedupeKeyFor('announcement', row.id),
        emailAllowed: true
      })))

  await db.announcement.update({ where: { id: row.id }, data: { status: 'sent', sentAt: now } })

  return { recipients: recipients.length, ...result }
}
