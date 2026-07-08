-- v2: Add type and dutyDate to attendance, add office_duties table

-- Add type column to attendance (default 'event')
ALTER TABLE "attendance" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'event';

-- Add dutyDate column (nullable, for duty check-ins)
ALTER TABLE "attendance" ADD COLUMN "dutyDate" TIMESTAMP(3);

-- Make eventId nullable since duty check-ins don't have an event
ALTER TABLE "attendance" ALTER COLUMN "eventId" DROP NOT NULL;

-- Add office_duties table
CREATE TABLE "office_duties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "office_duties_pkey" PRIMARY KEY ("id")
);

-- Add foreign key to office_duties
ALTER TABLE "office_duties" ADD CONSTRAINT "office_duties_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add unique constraint for duty check-ins (one per officer per day)
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_userId_dutyDate_key"
    UNIQUE ("userId", "dutyDate");

-- Index for faster lookup of duty attendance by date
CREATE INDEX "attendance_dutyDate_idx" ON "attendance"("dutyDate");
