-- T-0008 — attendance record integrity. Additive only: this migration drops no
-- attendance row and changes no existing column. It carries the two database
-- guards that keep a scan record honest.
--
-- 1. One open event attendance per student.
--
--    The attendance routes check "is there an open record?" and then write. The
--    check and the write are separate statements, so two officers scanning the
--    same student at the same moment can both pass the check and insert. The
--    only durable answer is a unique index the database enforces on the second
--    insert; the route already maps that violation (P2002) to "Already checked
--    in", so the losing scan is refused instead of becoming a second open row.
--
--    Prisma cannot express a partial index in schema.prisma (`@@unique` has no
--    WHERE clause), so this object is intentionally missing from the Prisma
--    schema and lives only here. It is not drift.
--
--    The index was first created by 20260708181121 for the same purpose. This
--    migration re-asserts it idempotently and verifies its shape, because a
--    database rebuilt from schema.prisma (or one whose history predates that
--    file's index) can lack it - which is exactly the hole this task closes.
--
--    If duplicate open rows exist, the index cannot be created. The block below
--    refuses and names the (eventId, userId) pairs. It NEVER deletes attendance.
--    To see the list before deploying, run:
--      SELECT "eventId", "userId", count(*)
--        FROM "attendance"
--       WHERE "checkOutAt" IS NULL AND "eventId" IS NOT NULL
--       GROUP BY 1, 2 HAVING count(*) > 1;
--
-- 2. A scan budget every serverless instance shares.
--
--    Vercel functions do not share memory, so an in-memory counter would give
--    each warm instance its own allowance. `scan_rate_limits` is the one row the
--    limiter increments atomically, so the limit survives scaling. One row per
--    officer per fixed window; `throttledAt` marks the first denial so exactly
--    one audit row is written per officer per window.

DO $$
DECLARE
  duplicates TEXT;
BEGIN
  SELECT string_agg(
           format('eventId=%s userId=%s openRows=%s', "eventId", "userId", open_rows),
           '; ' ORDER BY "eventId", "userId"
         )
    INTO duplicates
  FROM (
    SELECT "eventId", "userId", count(*) AS open_rows
    FROM "attendance"
    WHERE "checkOutAt" IS NULL AND "eventId" IS NOT NULL
    GROUP BY "eventId", "userId"
    HAVING count(*) > 1
  ) AS d;

  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION
      'Refusing to create attendance_event_open_unique: duplicate open attendance exists (%). No rows were deleted. Reconcile these rows, then re-run this migration.',
      left(duplicates, 1500);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_event_open_unique"
  ON "attendance" ("eventId", "userId")
  WHERE "checkOutAt" IS NULL AND "eventId" IS NOT NULL;

-- A database rebuilt from schema.prisma could already have an index with this
-- name but not this definition; IF NOT EXISTS would silently keep the wrong one.
DO $$
DECLARE
  is_unique BOOLEAN;
  predicate TEXT;
BEGIN
  SELECT i.indisunique, pg_get_expr(i.indpred, i.indrelid)
    INTO is_unique, predicate
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'attendance_event_open_unique'
    AND n.nspname = current_schema();

  IF is_unique IS NULL THEN
    RAISE EXCEPTION 'attendance_event_open_unique is missing after this migration';
  END IF;
  IF NOT is_unique THEN
    RAISE EXCEPTION 'attendance_event_open_unique exists but is not unique';
  END IF;
  IF predicate IS NULL
     OR position('checkOutAt' IN predicate) = 0
     OR position('eventId' IN predicate) = 0 THEN
    RAISE EXCEPTION
      'attendance_event_open_unique does not have the expected partial predicate: %',
      coalesce(predicate, '(none)');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "scan_rate_limits" (
  "officerId"   TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count"       INTEGER NOT NULL DEFAULT 0,
  "throttledAt" TIMESTAMP(3),
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scan_rate_limits_pkey" PRIMARY KEY ("officerId", "windowStart")
);

CREATE INDEX IF NOT EXISTS "scan_rate_limits_windowStart_idx"
  ON "scan_rate_limits"("windowStart");

ALTER TABLE "scan_rate_limits"
  DROP CONSTRAINT IF EXISTS "scan_rate_limits_officerId_fkey";

ALTER TABLE "scan_rate_limits"
  ADD CONSTRAINT "scan_rate_limits_officerId_fkey"
  FOREIGN KEY ("officerId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
