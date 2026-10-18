-- Phase 3 (required audience, plan section 8.2). Additive only.
-- Who MUST attend an event: drives the "expected" denominator in analytics and,
-- in P4, who gets absence fines. Default 'all' keeps every existing event as it
-- was. The college/section references are RESTRICT rather than SET NULL on
-- purpose: silently widening an audience to everyone would be wrong, so a
-- referenced college or section has to be archived instead of deleted.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "audienceType" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "audienceCollegeId" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "audienceYearLevel" INTEGER;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "audienceSectionId" TEXT;

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_audienceCollegeId_fkey";
ALTER TABLE "events" ADD CONSTRAINT "events_audienceCollegeId_fkey"
  FOREIGN KEY ("audienceCollegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_audienceSectionId_fkey";
ALTER TABLE "events" ADD CONSTRAINT "events_audienceSectionId_fkey"
  FOREIGN KEY ("audienceSectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "events_audienceType_idx" ON "events"("audienceType");
