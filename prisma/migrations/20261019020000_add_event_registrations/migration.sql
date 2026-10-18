-- Phase 2 (registration + waitlist, plan section 8.2). Additive only.
-- One row per person per event; cancelling keeps the row so re-registering
-- reuses it and the audit history stays readable.

CREATE TABLE IF NOT EXISTS "event_registrations" (
  "id"         TEXT NOT NULL,
  "eventId"    TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "status"     TEXT NOT NULL, -- registered | waitlisted | cancelled
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "promotedAt" TIMESTAMP(3),
  CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_registrations_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_registrations_eventId_userId_key"
  ON "event_registrations"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "event_registrations_eventId_status_idx"
  ON "event_registrations"("eventId", "status");
CREATE INDEX IF NOT EXISTS "event_registrations_userId_idx"
  ON "event_registrations"("userId");
