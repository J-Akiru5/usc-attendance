-- BC-4 (benchmark review; plan §8.2/§8.3/§8.5). Additive only.
-- The expected roster is frozen once the check-in window closes: one row per
-- expected person per event, with the placement that explained them at that
-- moment. The dashboard, exports, Student 360 and the fine generator read this
-- instead of resolving live, so a student who transfers college after the event
-- is neither charged nor missed, and a report exported today still reproduces
-- tomorrow.
--
-- `source` is the event's audience type at snapshot time (all | college |
-- yearLevel | section). `collegeId` / `yearLevel` / `sectionId` are copied values,
-- not foreign keys: they are historical context, not a live reference.
-- (eventId, userId) is unique, which is what makes a re-freeze idempotent.

CREATE TABLE IF NOT EXISTS "event_expected" (
  "id"         TEXT NOT NULL,
  "eventId"    TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "source"     TEXT NOT NULL,
  "collegeId"  TEXT,
  "yearLevel"  INTEGER,
  "sectionId"  TEXT,
  "snapshotAt" TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_expected_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_expected_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_expected_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_expected_eventId_userId_key" ON "event_expected"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "event_expected_eventId_idx" ON "event_expected"("eventId");
CREATE INDEX IF NOT EXISTS "event_expected_userId_idx" ON "event_expected"("userId");
