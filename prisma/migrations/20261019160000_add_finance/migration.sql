-- Phase 6: finance, budget & liquidation (plan section 8.7). Additive only:
-- six new tables plus the capability rows the module needs. Every amount is an
-- integer number of centavos, like the fines tables.
--
-- The proposal workflow (section 8.7's diagram) is stored as explicit steps:
-- decided -> noted_president / noted_adviser / noted_university_accountant ->
-- approved -> released -> liquidated (or rejected). The University Accountant
-- and the Campus Administrator are external signatories: the Treasurer records
-- their step with the date and a signed copy, so no accounts are created.

CREATE TABLE IF NOT EXISTS "budgets" (
  "id"         TEXT NOT NULL,
  "semesterId" TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'open',
  "notes"      TEXT,
  "createdBy"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "budgets_semesterId_key" ON "budgets"("semesterId");

CREATE TABLE IF NOT EXISTS "budget_lines" (
  "id"                TEXT NOT NULL,
  "budgetId"          TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "category"          TEXT NOT NULL DEFAULT 'other',
  "allocatedCentavos" INTEGER NOT NULL DEFAULT 0,
  "notes"             TEXT,
  "sortOrder"         INTEGER NOT NULL DEFAULT 0,
  "archived"          BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "budget_lines_budgetId_name_key" ON "budget_lines"("budgetId", "name");
CREATE INDEX IF NOT EXISTS "budget_lines_budgetId_sortOrder_idx" ON "budget_lines"("budgetId", "sortOrder");

CREATE TABLE IF NOT EXISTS "budget_entries" (
  "id"             TEXT NOT NULL,
  "lineId"         TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "amountCentavos" INTEGER NOT NULL,
  "description"    TEXT NOT NULL,
  "source"         TEXT,
  "spentAt"        TIMESTAMP(3) NOT NULL,
  "proposalId"     TEXT,
  "receiptKey"     TEXT,
  "receiptMime"    TEXT,
  "receiptSize"    INTEGER,
  "receiptName"    TEXT,
  "overrideReason" TEXT,
  "recordedBy"     TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "budget_entries_lineId_spentAt_idx" ON "budget_entries"("lineId", "spentAt");
CREATE INDEX IF NOT EXISTS "budget_entries_proposalId_idx" ON "budget_entries"("proposalId");
CREATE INDEX IF NOT EXISTS "budget_entries_kind_spentAt_idx" ON "budget_entries"("kind", "spentAt");

CREATE TABLE IF NOT EXISTS "budget_proposals" (
  "id"             TEXT NOT NULL,
  "budgetId"       TEXT NOT NULL,
  "lineId"         TEXT,
  "eventId"        TEXT,
  "projectName"    TEXT,
  "title"          TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "amountCentavos" INTEGER NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'decided',
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "budget_proposals_budgetId_status_idx" ON "budget_proposals"("budgetId", "status");
CREATE INDEX IF NOT EXISTS "budget_proposals_lineId_idx" ON "budget_proposals"("lineId");
CREATE INDEX IF NOT EXISTS "budget_proposals_eventId_idx" ON "budget_proposals"("eventId");

CREATE TABLE IF NOT EXISTS "proposal_steps" (
  "id"             TEXT NOT NULL,
  "proposalId"     TEXT NOT NULL,
  "step"           TEXT NOT NULL,
  "actorUserId"    TEXT,
  "signatoryName"  TEXT,
  "signatoryRole"  TEXT,
  "actedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note"           TEXT,
  "attachmentKey"  TEXT,
  "attachmentMime" TEXT,
  "attachmentSize" INTEGER,
  "attachmentName" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proposal_steps_pkey" PRIMARY KEY ("id")
);

-- One row per step per proposal: a noted step cannot be recorded twice, and the
-- unique index is the last line of defence against a double-tapped approval.
CREATE UNIQUE INDEX IF NOT EXISTS "proposal_steps_proposalId_step_key" ON "proposal_steps"("proposalId", "step");
CREATE INDEX IF NOT EXISTS "proposal_steps_step_actedAt_idx" ON "proposal_steps"("step", "actedAt");

CREATE TABLE IF NOT EXISTS "finance_settings" (
  "id"                 TEXT NOT NULL,
  "transparencyPublic" BOOLEAN NOT NULL DEFAULT FALSE,
  "transparencyNote"   TEXT,
  "updatedBy"          TEXT,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("id")
);

-- Foreign keys (all additive; nothing existing changes shape).
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_semesterId_fkey"
  FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_lineId_fkey"
  FOREIGN KEY ("lineId") REFERENCES "budget_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "budget_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_recordedBy_fkey"
  FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_lineId_fkey"
  FOREIGN KEY ("lineId") REFERENCES "budget_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_proposals" ADD CONSTRAINT "budget_proposals_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "proposal_steps" ADD CONSTRAINT "proposal_steps_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "budget_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposal_steps" ADD CONSTRAINT "proposal_steps_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Capabilities (plan §7.2): the Treasurer requests and holds the money, the
-- President / Vice President / Adviser note in-app, the Auditor reads
-- everything. Super admin keeps every capability through `admin.all`.
-- ---------------------------------------------------------------------------

INSERT INTO "role_capabilities" ("roleId", "capability") VALUES
  ('role-super-admin', 'finance.manage'),
  ('role-super-admin', 'finance.note'),
  ('role-super-admin', 'finance.audit')
ON CONFLICT ("roleId", "capability") DO NOTHING;

-- The org-chart roles the plan's matrix needs (§7.1 → §7.2): they are ordinary
-- capability bundles, assignable through the existing super-admin role route.
INSERT INTO "roles" ("id", "key", "name", "system") VALUES
  ('role-treasurer',     'treasurer',     'Treasurer (finance)',        TRUE),
  ('role-finance-noter', 'finance_noter', 'Finance noter (President)',  TRUE),
  ('role-auditor',       'auditor',       'Auditor',                    TRUE)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_capabilities" ("roleId", "capability") VALUES
  ('role-treasurer',     'finance.manage'),
  ('role-treasurer',     'finance.audit'),
  ('role-finance-noter', 'finance.note'),
  ('role-finance-noter', 'finance.audit'),
  ('role-auditor',       'finance.audit')
ON CONFLICT ("roleId", "capability") DO NOTHING;

-- Backfill by position, exactly once, so the council can use the module the day
-- this deploys instead of waiting for a manual role assignment. Students are
-- never matched, and re-running only ever adds what is missing.
INSERT INTO "user_roles" ("userId", "roleId", "assignedAt")
SELECT u."id", 'role-treasurer', CURRENT_TIMESTAMP
FROM "users" u
WHERE u."active" = TRUE
  AND u."role" <> 'student'
  AND lower(u."position") LIKE '%treasurer%'
ON CONFLICT DO NOTHING;

INSERT INTO "user_roles" ("userId", "roleId", "assignedAt")
SELECT u."id", 'role-finance-noter', CURRENT_TIMESTAMP
FROM "users" u
WHERE u."active" = TRUE
  AND u."role" <> 'student'
  AND (
    lower(u."position") LIKE '%president%'
    OR lower(u."position") LIKE '%adviser%'
    OR lower(u."position") LIKE '%advisor%'
  )
ON CONFLICT DO NOTHING;

INSERT INTO "user_roles" ("userId", "roleId", "assignedAt")
SELECT u."id", 'role-auditor', CURRENT_TIMESTAMP
FROM "users" u
WHERE u."active" = TRUE
  AND u."role" <> 'student'
  AND lower(u."position") LIKE '%auditor%'
ON CONFLICT DO NOTHING;
