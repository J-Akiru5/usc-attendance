-- Phase 3: self-registered students and per-attendance e-signatures
CREATE TABLE IF NOT EXISTS "student_profiles" (
  "userId"    TEXT NOT NULL,
  "studentNo" TEXT NOT NULL,
  "program"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "student_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_profiles_studentNo_key" ON "student_profiles"("studentNo");

CREATE TABLE IF NOT EXISTS "attendance_signatures" (
  "attendanceId" TEXT NOT NULL,
  "png"          BYTEA NOT NULL,
  "sha256"       TEXT NOT NULL,
  "signedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_signatures_pkey" PRIMARY KEY ("attendanceId"),
  CONSTRAINT "attendance_signatures_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_signatures" ENABLE ROW LEVEL SECURITY;
