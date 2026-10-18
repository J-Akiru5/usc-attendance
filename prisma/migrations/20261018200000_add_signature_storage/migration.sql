-- Phase 1 free-tier hardening (plan section 11.1): signature images can live in
-- R2 instead of Postgres. Additive: the columns are nullable, old rows keep
-- their bytes in "png", and readers decide per row, so the switch is reversible.

ALTER TABLE "attendance_signatures" ADD COLUMN IF NOT EXISTS "storageKey"     TEXT;
ALTER TABLE "attendance_signatures" ADD COLUMN IF NOT EXISTS "storageBackend" TEXT;
