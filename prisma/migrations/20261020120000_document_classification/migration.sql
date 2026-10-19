-- Benchmark amendment BC-9 (plan sections 8.8 and 11.2): document classification,
-- redacted public copies and audited publishing. Additive only - nothing is
-- dropped, renamed or retyped.
--
-- The rule this migration exists to make enforceable:
--   nothing is public unless explicitly published, and no published artefact
--   carries an unauthorised student name.
--
-- `documents.classification` is the authoritative visibility (public | officers |
-- restricted); `visibility` stays as the legacy mirror older queries read.
-- Existing rows keep exactly the audience they had: a public filing stays public,
-- everything else becomes officers-only. `restricted` is never inferred.
--
-- A redacted copy is a *version* (document_versions."isRedacted") pointed at by
-- documents."redactedVersionId". The original stays the current version of the
-- record; the derivative is what the public reader serves.
--
-- `publicSearchText`/`publicSearchVector` are the visitor's search corpus. It is
-- the redacted text when a redacted copy is in force, so a public search can
-- never match (and therefore confirm) a phrase that only exists in the original.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "classification" TEXT NOT NULL DEFAULT 'officers';

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "redactedVersionId" TEXT;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "redactionNote" TEXT;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "publicSearchText" TEXT NOT NULL DEFAULT '';

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "publicSearchVector" tsvector GENERATED ALWAYS AS
    (to_tsvector('simple', COALESCE("publicSearchText", ''))) STORED;

ALTER TABLE "document_versions"
  ADD COLUMN IF NOT EXISTS "isRedacted" BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: the audience a filing already had, and a public corpus identical to
-- the officers' corpus until a redacted copy exists.
UPDATE "documents"
   SET "classification" = CASE WHEN "visibility" = 'public' THEN 'public' ELSE 'officers' END
 WHERE "classification" IS DISTINCT FROM
       (CASE WHEN "visibility" = 'public' THEN 'public' ELSE 'officers' END);

UPDATE "documents"
   SET "publicSearchText" = "searchText"
 WHERE "publicSearchText" = '' AND "searchText" <> '';

CREATE INDEX IF NOT EXISTS "documents_classification_archived_createdAt_idx"
  ON "documents"("classification", "archived", "createdAt");

CREATE INDEX IF NOT EXISTS "documents_publicSearchVector_idx"
  ON "documents" USING GIN ("publicSearchVector");

-- One redacted copy in force per document is the pointer, not a constraint on
-- history: an older redacted version stays readable to officers after a newer one
-- is prepared. ON DELETE SET NULL is what lets a document's history be pruned
-- without breaking the pointer.
DO $$
BEGIN
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_redactedVersionId_fkey"
    FOREIGN KEY ("redactedVersionId") REFERENCES "document_versions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
