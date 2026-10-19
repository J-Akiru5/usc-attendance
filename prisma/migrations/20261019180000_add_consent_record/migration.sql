-- Phase 4/5 hardening (consent record, plan §11.2 + benchmark BC-1). Additive only.
-- The register route has always required `consent: true`; nothing stored it, so
-- the council could not demonstrate who agreed, to what, or when. Nullable on
-- purpose: an account created before this migration has no recorded consent, and
-- inventing one would be worse than admitting the gap.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consentSource" TEXT;

CREATE INDEX IF NOT EXISTS "users_consentVersion_idx" ON "users"("consentVersion");
