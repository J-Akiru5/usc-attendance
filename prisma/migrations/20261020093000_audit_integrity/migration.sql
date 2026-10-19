-- BC-10 (plan §11.2, benchmark BC-10). Additive only.
--
-- Fines, money and privacy all rest on this log, so a row has to be able to
-- prove *which* target it changed and *who* read a sensitive record. The raw
-- client address is never stored: `ipHash` is SHA-256 of a salted address, so
-- an auditor can tell two requests came from the same place without the log
-- becoming a location history. `requestId` ties every row written while
-- serving one request together.
--
-- The log is append-only in code (asserted by tests); this migration adds no
-- trigger because the application is the only writer and every row (including
-- old ones) must stay readable.

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "targetType" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "targetId"   TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorRole"  TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "ipHash"     TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "requestId"  TEXT;

-- "what happened to this fine/payment/student?"
CREATE INDEX IF NOT EXISTS "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");
-- "everything that happened while serving this request?"
CREATE INDEX IF NOT EXISTS "audit_logs_requestId_idx" ON "audit_logs"("requestId");
