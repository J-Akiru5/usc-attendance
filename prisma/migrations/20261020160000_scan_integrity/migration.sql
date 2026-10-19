-- Benchmark BC-5 (plan §8.2, §11.2): scan integrity. Additive only — nothing is
-- dropped, renamed or retyped; existing attendance rows keep working with null
-- device times and null keys.
--
-- Three facts a dispute needs, none of which the old row could prove:
--
--   "scannedAt"     the moment the device claimed the scan happened. Stored as
--                   evidence; the server decides what the row is stamped with,
--                   so a fast phone clock cannot walk a check-in into the future.
--   "idempotencyKey" one opaque client-generated key per scan. A retry after a
--                   lost response reuses it, so the route returns the first
--                   record instead of writing a second one. PostgreSQL unique
--                   indexes treat NULLs as distinct, so live scans without a key
--                   and every pre-existing row are unaffected.
--   "manualReason"  why an officer recorded a check-in by hand. Required by the
--                   API for method = 'manual' and written to the audit log.
--
-- The open-record partial unique indexes from 20260708181121 already stop two
-- concurrent scans of the same student at the same event; the key closes the
-- retry/replay hole those cannot see.

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMP(3);

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "manualReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_idempotencyKey_key"
  ON "attendance"("idempotencyKey");
