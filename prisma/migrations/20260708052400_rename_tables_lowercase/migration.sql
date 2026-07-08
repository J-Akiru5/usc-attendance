-- Rename PascalCase tables to lowercase (to match Supabase REST API and Prisma @@map)

-- Drop existing foreign key constraints first
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_eventId_fkey";
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_userId_fkey";
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_recordedBy_fkey";
ALTER TABLE "Event" DROP CONSTRAINT "Event_createdBy_fkey";

-- Rename tables
ALTER TABLE "User" RENAME TO "users";
ALTER TABLE "Event" RENAME TO "events";
ALTER TABLE "Attendance" RENAME TO "attendance";

-- Rename primary key constraints
ALTER TABLE "users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";
ALTER TABLE "events" RENAME CONSTRAINT "Event_pkey" TO "events_pkey";
ALTER TABLE "attendance" RENAME CONSTRAINT "Attendance_pkey" TO "attendance_pkey";

-- Rename unique indexes
ALTER INDEX "User_email_key" RENAME TO "users_email_key";
ALTER INDEX "Attendance_eventId_userId_key" RENAME TO "attendance_eventId_userId_key";

-- Re-add foreign key constraints with new table names
ALTER TABLE "events" ADD CONSTRAINT "events_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance" ADD CONSTRAINT "attendance_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance" ADD CONSTRAINT "attendance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recordedBy_fkey"
  FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
