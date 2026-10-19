-- Phase 4 (excuse requests, plan section 8.5). Additive only.
-- A student files an excuse against a fine (medical, academic conflict, other);
-- staff approve or deny it. Approving waives the fine in the same transaction-
-- free sequence (status/waivedAt/waivedBy/waiveReason on the fine are set).
--
-- Attachments live where signatures live (object storage in production, the DB
-- in development/e2e) and the row keeps only the key, mime type and size.

CREATE TABLE IF NOT EXISTS "excuses" (
  "id"          TEXT NOT NULL,
  "fineId"      TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "category"    TEXT NOT NULL DEFAULT 'other', -- medical | academic | other
  "reason"      TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
  "attachmentKey"  TEXT,
  "attachmentMime" TEXT,
  "attachmentSize" INTEGER,
  "reviewedBy"  TEXT,
  "reviewedAt"  TIMESTAMP(3),
  "reviewNote"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "excuses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "excuses_fineId_fkey" FOREIGN KEY ("fineId")
    REFERENCES "fines"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "excuses_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "excuses_reviewedBy_fkey" FOREIGN KEY ("reviewedBy")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "excuses_status_createdAt_idx" ON "excuses"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "excuses_userId_createdAt_idx" ON "excuses"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "excuses_fineId_idx" ON "excuses"("fineId");
