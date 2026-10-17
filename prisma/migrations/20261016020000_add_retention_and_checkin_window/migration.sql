-- Signature retention per semester, check-in windows, settings managers
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "canConfigure" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "checkInOpensAt" TIMESTAMP(3);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "checkInClosesAt" TIMESTAMP(3);

ALTER TABLE "attendance_signatures" ALTER COLUMN "png" DROP NOT NULL;
ALTER TABLE "attendance_signatures" ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "signatureRetentionSemesters" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "purgeGraceDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lastPurgeAt" TIMESTAMP(3);
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lastPurgeCount" INTEGER;

CREATE TABLE IF NOT EXISTS "semesters" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "startsOn"  TIMESTAMP(3) NOT NULL,
  "endsOn"    TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "semesters_startsOn_idx" ON "semesters"("startsOn");

ALTER TABLE "semesters" ENABLE ROW LEVEL SECURITY;
