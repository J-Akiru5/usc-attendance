-- Phase 4/5 hardening (event cancellation, benchmark BC-7). Additive only.
-- Until now an event had no way to be called off, so a rained-out assembly would
-- still receive reminders and, once its window closed, fine its entire audience.
-- Cancellation is one-way on purpose: a cancelled event is a record of something
-- that was called off, and re-instating it would quietly re-arm the fines.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'scheduled'; -- scheduled | cancelled
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_cancelledBy_fkey";
ALTER TABLE "events" ADD CONSTRAINT "events_cancelledBy_fkey"
  FOREIGN KEY ("cancelledBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "events_status_date_idx" ON "events"("status", "date");
