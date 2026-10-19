-- Phase 4 (absence fines, plan section 8.5). Additive only.
-- Money is stored in *centavos* (integers): nothing here can round twice, and
-- ₱50 is 5000. Rules are one row per scope (global, one per event, one per
-- category) with event > category > global precedence resolved in code.
-- One fine per student per event (the unique index), and `events.finesIssuedAt`
-- is what makes the nightly generation idempotent.

CREATE TABLE IF NOT EXISTS "fine_rules" (
  "id"               TEXT NOT NULL,
  "scope"            TEXT NOT NULL DEFAULT 'global', -- global | event | category
  "eventId"          TEXT,
  "categoryId"       TEXT,
  "absentCentavos"   INTEGER NOT NULL DEFAULT 5000, -- ₱50.00
  "lateCentavos"     INTEGER NOT NULL DEFAULT 2500, -- ₱25.00
  "lateAfterMinutes" INTEGER NOT NULL DEFAULT 30,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fine_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fine_rules_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fine_rules_categoryId_fkey" FOREIGN KEY ("categoryId")
    REFERENCES "event_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "fine_rules_eventId_key" ON "fine_rules"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "fine_rules_categoryId_key" ON "fine_rules"("categoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "fine_rules_scope_global_key" ON "fine_rules"("scope") WHERE "scope" = 'global';

CREATE TABLE IF NOT EXISTS "fines" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "eventId"        TEXT NOT NULL,
  "kind"           TEXT NOT NULL, -- absent | late
  "amountCentavos" INTEGER NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | paid | waived
  "ruleSnapshot"   JSONB, -- the rule that produced it, for the audit trail
  "issuedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"         TIMESTAMP(3),
  "paidBy"         TEXT,
  "paymentRef"     TEXT, -- OR number / GCash reference
  "waivedAt"       TIMESTAMP(3),
  "waivedBy"       TEXT,
  "waiveReason"    TEXT,
  CONSTRAINT "fines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fines_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fines_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fines_paidBy_fkey" FOREIGN KEY ("paidBy")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "fines_waivedBy_fkey" FOREIGN KEY ("waivedBy")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "fines_userId_eventId_key" ON "fines"("userId", "eventId");
CREATE INDEX IF NOT EXISTS "fines_userId_status_idx" ON "fines"("userId", "status");
CREATE INDEX IF NOT EXISTS "fines_eventId_idx" ON "fines"("eventId");
CREATE INDEX IF NOT EXISTS "fines_status_idx" ON "fines"("status");

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "finesIssuedAt" TIMESTAMP(3);
