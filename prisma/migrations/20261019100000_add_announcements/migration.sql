-- Phase 3 (announcements, plan section 8.4). Additive only.
-- An announcement is written once, targeted with the same audience columns as
-- events, then either sent now or left for the cron when its time comes. The
-- notifications it produces are its delivery log (kind 'announcement', dedupe
-- key 'announcement:<id>'), so a re-run of the cron cannot double-send.

CREATE TABLE IF NOT EXISTS "announcements" (
  "id"        TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL, -- restricted markdown subset: paragraphs, **bold**, *italic*, [links](https://…), - lists
  "pinned"    BOOLEAN NOT NULL DEFAULT false,
  "status"    TEXT NOT NULL DEFAULT 'draft', -- draft | scheduled | sent | cancelled
  "scheduledFor" TIMESTAMP(3),
  "sentAt"    TIMESTAMP(3),
  "audienceType"      TEXT NOT NULL DEFAULT 'all',
  "audienceCollegeId" TEXT,
  "audienceYearLevel" INTEGER,
  "audienceSectionId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcements_createdBy_fkey" FOREIGN KEY ("createdBy")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "announcements_audienceCollegeId_fkey" FOREIGN KEY ("audienceCollegeId")
    REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "announcements_audienceSectionId_fkey" FOREIGN KEY ("audienceSectionId")
    REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "announcements_status_scheduledFor_idx"
  ON "announcements"("status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "announcements_pinned_idx"
  ON "announcements"("pinned", "status");
