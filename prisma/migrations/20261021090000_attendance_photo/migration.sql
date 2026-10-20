-- T-0009 — photo evidence for manual check-ins. Additive only: this migration
-- adds three nullable columns and one index. It changes no existing row and
-- requires no backfill; a manual entry without a photo keeps working exactly as
-- before.
--
-- The object itself NEVER lives in Postgres. `photoKey` points at a private
-- object store; `photoExpiresAt` is what the daily retention job scans.
--
-- The index is named the way Prisma names `@@index([photoExpiresAt])`, so a
-- database migrated from schema.prisma and one migrated from this file agree.

ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "photoKey"        TEXT;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "photoCapturedAt" TIMESTAMP(3);
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "photoExpiresAt"  TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "attendance_photoExpiresAt_idx"
  ON "attendance"("photoExpiresAt");
