-- Phase 2 (events calendar, plan section 8.2): colour-coded event categories,
-- plus the event fields the calendar and registration need. Additive only.

CREATE TABLE IF NOT EXISTS "event_categories" (
  "id"        TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "color"     TEXT NOT NULL DEFAULT '#C9A24B',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archived"  BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_categories_code_key" ON "event_categories"("code");

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "categoryId"           TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "capacity"             INTEGER;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "registrationRequired" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_categoryId_fkey";
ALTER TABLE "events" ADD CONSTRAINT "events_categoryId_fkey" FOREIGN KEY ("categoryId")
  REFERENCES "event_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "events_categoryId_idx" ON "events"("categoryId");

-- The categories the plan names (plus a community-service one), editable later.
INSERT INTO "event_categories" ("id", "code", "name", "color", "sortOrder") VALUES
  ('cat-general-assembly',  'general-assembly',  'General Assembly',  '#142850', 1),
  ('cat-flag-ceremony',     'flag-ceremony',     'Flag Ceremony',     '#C9A24B', 2),
  ('cat-seminar',           'seminar',           'Seminar',           '#1E4A9E', 3),
  ('cat-sports',            'sports',            'Sports',            '#3F7D5C', 4),
  ('cat-community-service', 'community-service', 'Community Service', '#8A6D2F', 5)
ON CONFLICT ("code") DO NOTHING;
