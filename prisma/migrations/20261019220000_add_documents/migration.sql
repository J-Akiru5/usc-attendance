-- Phase 7 (documents & resolutions archive, plan section 8.8). Additive only:
-- five new tables, their indexes, the seeded filing types and one new capability.
-- Nothing existing is altered — no column is dropped, renamed or retyped.
--
-- Tables:
--   document_types       filing types (minutes, resolutions, memos, …) with the
--                        prefix their numbers carry and the padding of the sequence
--   document_sequences   one counter row per type+year, bumped atomically
--   documents            the current version's content, the filing number and the
--                        addressable metadata (tags, visibility, links, archive flag)
--   document_versions    every version ever filed: immutable history
--   document_attachments uploaded files: object-storage key + the text extracted
--                        at upload time (never the bytes themselves)
--
-- Full-text search: `documents."searchVector"` is a STORED generated tsvector
-- built from `searchText` (title + body + tags + every attachment's extracted
-- text) and GIN-indexed. This is PostgreSQL's own documented pattern
-- ("Tables and Indexes", full-text search chapter) and it means the index can
-- never drift from the corpus: no writer has to remember to update it.
-- The 'simple' configuration is deliberate — English stemming would mangle
-- Filipino names and terms ("Danugrao", "Aquiño", "barangay"), and 'simple' is
-- accent-preserving, so both the accented and the plain spelling of a word are
-- separate lexemes and the query builder asks for both (see buildSearchQuery).

CREATE TABLE IF NOT EXISTS "document_types" (
  "id"        TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "prefix"    TEXT NOT NULL,
  "pad"       INTEGER NOT NULL DEFAULT 3,
  "archived"  BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_types_key_key" ON "document_types"("key");

-- The five types the council files today. Readable ids keep the seed idempotent
-- and let the app talk about them without a lookup.
INSERT INTO "document_types" ("id", "key", "name", "prefix", "pad") VALUES
  ('doc-type-minutes',      'minutes',      'Minutes',                 'Minutes No.',      3),
  ('doc-type-resolution',   'resolution',   'Resolution',              'Resolution No.',   3),
  ('doc-type-memo',         'memo',         'Memorandum',              'Memo No.',         3),
  ('doc-type-constitution', 'constitution', 'Constitution and By-Laws','Constitution No.', 3),
  ('doc-type-report',       'report',       'Report',                  'Report No.',       3)
ON CONFLICT ("key") DO NOTHING;

CREATE TABLE IF NOT EXISTS "document_sequences" (
  "typeId"    TEXT NOT NULL,
  "year"      INTEGER NOT NULL,
  "last"      INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("typeId", "year"),
  CONSTRAINT "document_sequences_typeId_fkey" FOREIGN KEY ("typeId")
    REFERENCES "document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "documents" (
  "id"             TEXT NOT NULL,
  "typeId"         TEXT NOT NULL,
  "year"           INTEGER NOT NULL,
  "sequence"       INTEGER NOT NULL,
  "number"         TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "tags"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "visibility"     TEXT NOT NULL DEFAULT 'officers', -- public | officers
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "archived"       BOOLEAN NOT NULL DEFAULT FALSE,
  "searchText"     TEXT NOT NULL DEFAULT '',
  "searchVector"   tsvector GENERATED ALWAYS AS
                     (to_tsvector('simple', COALESCE("searchText", ''))) STORED,
  "eventId"        TEXT,
  "financeRef"     TEXT,
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "documents_typeId_fkey" FOREIGN KEY ("typeId")
    REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "documents_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "documents_createdBy_fkey" FOREIGN KEY ("createdBy")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- One number per document, forever: the unique index is the last line of defence
-- behind the atomic counter bump.
CREATE UNIQUE INDEX IF NOT EXISTS "documents_number_key" ON "documents"("number");
CREATE INDEX IF NOT EXISTS "documents_typeId_year_idx" ON "documents"("typeId", "year");
CREATE INDEX IF NOT EXISTS "documents_visibility_archived_createdAt_idx"
  ON "documents"("visibility", "archived", "createdAt");
CREATE INDEX IF NOT EXISTS "documents_searchVector_idx" ON "documents" USING GIN ("searchVector");

CREATE TABLE IF NOT EXISTS "document_versions" (
  "id"         TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "version"    INTEGER NOT NULL,
  "title"      TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "tags"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "visibility" TEXT NOT NULL,
  "changeNote" TEXT,
  "createdBy"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId")
    REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_versions_createdBy_fkey" FOREIGN KEY ("createdBy")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_documentId_version_key"
  ON "document_versions"("documentId", "version");
CREATE INDEX IF NOT EXISTS "document_versions_documentId_version_idx"
  ON "document_versions"("documentId", "version");

CREATE TABLE IF NOT EXISTS "document_attachments" (
  "id"              TEXT NOT NULL,
  "documentId"      TEXT NOT NULL,
  "versionId"       TEXT,
  "fileName"        TEXT NOT NULL,
  "mime"            TEXT NOT NULL,
  "size"            INTEGER NOT NULL,
  "storageKey"      TEXT NOT NULL,
  "textContent"     TEXT,
  "textExtractedAt" TIMESTAMP(3),
  "createdBy"       TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_attachments_documentId_fkey" FOREIGN KEY ("documentId")
    REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_attachments_versionId_fkey" FOREIGN KEY ("versionId")
    REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "document_attachments_createdBy_fkey" FOREIGN KEY ("createdBy")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "document_attachments_documentId_idx"
  ON "document_attachments"("documentId");

-- The new capability (plan section 7.2, "Documents: publish"). The app mirrors it
-- in server/utils/rbac.ts; the seeded roles get it here so an existing database
-- behaves like a fresh one.
INSERT INTO "role_capabilities" ("roleId", "capability") VALUES
  ('role-super-admin', 'documents.publish'),
  ('role-staff',       'documents.publish')
ON CONFLICT ("roleId", "capability") DO NOTHING;
