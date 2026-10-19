-- Benchmark amendment BC-11 (plan sections 8.9 and 11.2): a student can ask
-- the council to correct a stored profile field, and staff must decide the
-- request with a recorded reason. Additive only: one new table and its indexes;
-- no existing column is changed, renamed or dropped.
--
-- The table stores the *proposal* and the decision. It deliberately does not
-- store the corrected value as history: the profile row is the current truth,
-- and the audit log is the evidence of what changed and who decided it.
--
-- `kind` is text (not an enum) so a later erasure/portability request kind can
-- be added without a destructive enum migration. Today the only writer is the
-- rectification route.
--
-- Both outcomes require a reason (`reason`), and a decision names its decider
-- (`decidedBy`) and time (`decidedAt`). `currentValue` is a snapshot taken when
-- the student files, so a reviewer can see what they were asking to change even
-- if the record is corrected in the meantime.

CREATE TABLE IF NOT EXISTS "privacy_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'rectification',
  "field" TEXT NOT NULL,
  "currentValue" TEXT,
  "proposedValue" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "privacy_requests_status_createdAt_idx"
  ON "privacy_requests"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "privacy_requests_userId_createdAt_idx"
  ON "privacy_requests"("userId", "createdAt");

-- A student's requests die with the account (the account row is the subject);
-- removing a deciding officer must not erase the decision record, so that side
-- is SET NULL.
DO $$
BEGIN
  ALTER TABLE "privacy_requests"
    ADD CONSTRAINT "privacy_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "privacy_requests"
    ADD CONSTRAINT "privacy_requests_decidedBy_fkey"
    FOREIGN KEY ("decidedBy") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
