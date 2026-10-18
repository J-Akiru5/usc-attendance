-- Phase 2 (recurring events, plan section 8.2). Additive only.
-- A series is stored as real event rows so attendance, registration and the QR
-- flow stay per occurrence: the master is the first instance (seriesId null,
-- rrule set) and every later instance points back at it.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "rrule" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "recurrenceIndex" INTEGER;

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_seriesId_fkey";
ALTER TABLE "events" ADD CONSTRAINT "events_seriesId_fkey"
  FOREIGN KEY ("seriesId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "events_seriesId_idx" ON "events"("seriesId");
