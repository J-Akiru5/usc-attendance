-- D-01 (decision register §12.3, from benchmark BC-7). Additive only.
-- Monetary sanctions apply to *officers* and only when the rule carries the
-- council's citation; regular students get warning/service. A service sanction
-- is an obligation, not money — it is closed when it is marked served, and until
-- then clearance treats it exactly like an unpaid fine.

ALTER TABLE "fine_rules" ADD COLUMN IF NOT EXISTS "sanctionType" TEXT NOT NULL DEFAULT 'warning'; -- monetary | warning | service
ALTER TABLE "fine_rules" ADD COLUMN IF NOT EXISTS "authorityRef" TEXT;      -- the resolution / by-law that permits charging money
ALTER TABLE "fine_rules" ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3);
-- D-05's fifteen-minute default, brought down to the schema so the database and
-- the code agree.
ALTER TABLE "fine_rules" ALTER COLUMN "lateAfterMinutes" SET DEFAULT 15;

ALTER TABLE "fines" ADD COLUMN IF NOT EXISTS "sanctionType" TEXT NOT NULL DEFAULT 'monetary'; -- monetary | warning | service
ALTER TABLE "fines" ADD COLUMN IF NOT EXISTS "servedAt" TIMESTAMP(3);
ALTER TABLE "fines" ADD COLUMN IF NOT EXISTS "servedBy" TEXT;
ALTER TABLE "fines" ADD COLUMN IF NOT EXISTS "servedNote" TEXT;

ALTER TABLE "fines" DROP CONSTRAINT IF EXISTS "fines_servedBy_fkey";
ALTER TABLE "fines" ADD CONSTRAINT "fines_servedBy_fkey"
  FOREIGN KEY ("servedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing rows keep their meaning: they were issued under a monetary rule, so
-- the default above is correct for them.
CREATE INDEX IF NOT EXISTS "fines_userId_sanctionType_status_idx" ON "fines"("userId", "sanctionType", "status");
