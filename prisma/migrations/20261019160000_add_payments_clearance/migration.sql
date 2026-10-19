-- Phase 4 (payments + clearance + verification, plan section 8.5). Additive only.
-- A payment settles one fine in full (partial payments are deliberately out of
-- scope for v1), recorded by the Treasurer with an OR number or a GCash
-- reference. A clearance is issued with a random code when a student owes
-- nothing; the public /verify page checks the code AND recomputes the live
-- status, so a later fine makes an old certificate read "no longer cleared" —
-- that recomputation is the tamper check the plan asks for.

CREATE TABLE IF NOT EXISTS "payments" (
  "id"             TEXT NOT NULL,
  "fineId"         TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "amountCentavos" INTEGER NOT NULL,
  "method"         TEXT NOT NULL, -- cash | gcash
  "reference"      TEXT NOT NULL, -- OR number (cash) or GCash reference
  "note"           TEXT,
  "receivedBy"     TEXT NOT NULL,
  "receivedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_fineId_fkey" FOREIGN KEY ("fineId")
    REFERENCES "fines"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payments_receivedBy_fkey" FOREIGN KEY ("receivedBy")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_fineId_key" ON "payments"("fineId");
CREATE INDEX IF NOT EXISTS "payments_userId_idx" ON "payments"("userId");
CREATE INDEX IF NOT EXISTS "payments_receivedAt_idx" ON "payments"("receivedAt");

CREATE TABLE IF NOT EXISTS "clearances" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "code"            TEXT NOT NULL,
  "coveredCentavos" INTEGER NOT NULL,
  "coveredFines"    JSONB,
  "issuedBy"        TEXT NOT NULL,
  "issuedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"       TIMESTAMP(3),
  "revokedBy"       TEXT,
  "note"            TEXT,
  CONSTRAINT "clearances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clearances_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clearances_issuedBy_fkey" FOREIGN KEY ("issuedBy")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clearances_revokedBy_fkey" FOREIGN KEY ("revokedBy")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "clearances_code_key" ON "clearances"("code");
CREATE INDEX IF NOT EXISTS "clearances_userId_issuedAt_idx" ON "clearances"("userId", "issuedAt");
