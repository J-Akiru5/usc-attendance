-- Phase 1: academic reference data (colleges, programs, sections) and the
-- student profile's academic placement. Additive only: new tables plus
-- nullable columns on student_profiles, so the previous app keeps working.

CREATE TABLE IF NOT EXISTS "colleges" (
  "id"        TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "archived"  BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "colleges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "colleges_code_key" ON "colleges"("code");

CREATE TABLE IF NOT EXISTS "programs" (
  "id"         TEXT NOT NULL,
  "collegeId"  TEXT NOT NULL,
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "yearLevels" INTEGER NOT NULL DEFAULT 4,
  "archived"   BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "programs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "programs_collegeId_fkey" FOREIGN KEY ("collegeId")
    REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "programs_collegeId_code_key" ON "programs"("collegeId", "code");
CREATE INDEX IF NOT EXISTS "programs_collegeId_idx" ON "programs"("collegeId");

CREATE TABLE IF NOT EXISTS "sections" (
  "id"        TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "yearLevel" INTEGER NOT NULL,
  "name"      TEXT NOT NULL,
  "archived"  BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sections_programId_fkey" FOREIGN KEY ("programId")
    REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "sections_programId_yearLevel_name_key"
  ON "sections"("programId", "yearLevel", "name");
CREATE INDEX IF NOT EXISTS "sections_programId_idx" ON "sections"("programId");

-- Student profile: academic placement. Nullable so existing rows stay valid;
-- the legacy free-text "program" column is kept for display compatibility.
ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "collegeId"     TEXT;
ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "programId"     TEXT;
ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "yearLevel"     INTEGER;
ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "sectionId"     TEXT;
ALTER TABLE "student_profiles" ADD COLUMN IF NOT EXISTS "contactNumber" TEXT;

ALTER TABLE "student_profiles"
  DROP CONSTRAINT IF EXISTS "student_profiles_collegeId_fkey";
ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_collegeId_fkey" FOREIGN KEY ("collegeId")
  REFERENCES "colleges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "student_profiles"
  DROP CONSTRAINT IF EXISTS "student_profiles_programId_fkey";
ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_programId_fkey" FOREIGN KEY ("programId")
  REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "student_profiles"
  DROP CONSTRAINT IF EXISTS "student_profiles_sectionId_fkey";
ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_sectionId_fkey" FOREIGN KEY ("sectionId")
  REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "student_profiles_collegeId_idx" ON "student_profiles"("collegeId");
CREATE INDEX IF NOT EXISTS "student_profiles_programId_idx" ON "student_profiles"("programId");
CREATE INDEX IF NOT EXISTS "student_profiles_sectionId_idx" ON "student_profiles"("sectionId");
