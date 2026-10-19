import { HttpError } from './http'

/**
 * Event cancellation (benchmark BC-7). Until this existed, a rained-out assembly
 * would still receive its 24 h and 1 h reminders and, once the check-in window
 * closed, fine everyone who stayed home. A cancelled event is inert: no
 * reminders, no fines, no registration, no check-in.
 *
 * Cancellation is one-way on purpose — a cancelled event is a record of
 * something that was called off, and re-instating it would quietly re-arm the
 * fines. Calling a *new* event is the honest way to try again.
 */
export interface CancellableEvent {
  status: string
  title: string
}

/** Why an event cannot be cancelled right now, or null when it can. */
export function cancellationBlockedReason(event: CancellableEvent): string | null {
  if (event.status === 'cancelled') return 'That event is already cancelled'
  return null
}

/** Throws unless the event is still happening — the guard every path shares. */
export function assertEventActive(event: { status?: string | null, title?: string }): void {
  if (event.status === 'cancelled') {
    throw new HttpError(409, `"${event.title ?? 'This event'}" was cancelled. Nothing is recorded for it.`)
  }
}

/** True when an event still deserves reminders and fines. */
export function isEventActive(event: { status?: string | null }): boolean {
  return event.status !== 'cancelled'
}

/** The sentence the audience gets, kept short enough for a notification. */
export function cancellationNotice(title: string, reason: string | null): string {
  const base = `"${title}" has been cancelled. Anything scheduled for it — reminders, check-ins and fines — no longer applies.`
  return reason && reason.trim().length > 0
    ? `${base} Reason given: ${reason.trim().slice(0, 200)}`
    : base
}
