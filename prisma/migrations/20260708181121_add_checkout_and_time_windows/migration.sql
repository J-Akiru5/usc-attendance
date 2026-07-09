/*
  Warnings:

  - The primary key for the `office_duties` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/

-- Drop existing constraints (index-backed unique constraints must be dropped as constraints, not indexes)
ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_eventId_userId_key";
ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_userId_dutyDate_key";

-- DropForeignKey
ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_eventId_fkey";

-- DropIndex (non-unique indexes)
DROP INDEX IF EXISTS "attendance_dutyDate_idx";

-- AlterTable: add checkOutAt
ALTER TABLE "attendance" ADD COLUMN "checkOutAt" TIMESTAMP(3);

-- AlterTable: office_duties PK change
ALTER TABLE "office_duties" DROP CONSTRAINT IF EXISTS "office_duties_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "office_duties_pkey" PRIMARY KEY ("id");

-- AlterTable: users columns (idempotent)
DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- CreateTable: audit_logs (idempotent)
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: org_profile
CREATE TABLE IF NOT EXISTS "org_profile" (
    "id" TEXT NOT NULL,
    "dutyCheckInCutoff" TEXT NOT NULL DEFAULT '12:00',
    "dutyCheckOutStart" TEXT NOT NULL DEFAULT '12:00',
    CONSTRAINT "org_profile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes: allow unlimited historical rows, but only one open (checkOutAt IS NULL) record per officer per event/day
CREATE UNIQUE INDEX "attendance_event_open_unique" ON "attendance"("eventId", "userId") WHERE "checkOutAt" IS NULL AND "eventId" IS NOT NULL;
CREATE UNIQUE INDEX "attendance_duty_open_unique" ON "attendance"("userId", "dutyDate") WHERE "checkOutAt" IS NULL AND "dutyDate" IS NOT NULL;
