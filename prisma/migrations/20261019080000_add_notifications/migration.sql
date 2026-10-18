-- Phase 3 (notifications core, plan section 8.4). Additive only.
-- One row per notification per user. `dedupeKey` is what makes the reminder cron
-- safe to re-run: the unique (userId, dedupeKey) index refuses a second row for
-- the same event and window. NULL keys are distinct in Postgres, so ordinary
-- one-off notifications are unaffected.

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "kind"      TEXT NOT NULL, -- announcement | registration_confirmed | waitlist_promoted | event_reminder | ...
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "link"      TEXT,
  "dedupeKey" TEXT,
  "channels"  TEXT[] NOT NULL DEFAULT ARRAY['inApp', 'email']::TEXT[], -- how it was delivered
  "readAt"    TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notifications_createdBy_fkey" FOREIGN KEY ("createdBy")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_userId_dedupeKey_key"
  ON "notifications"("userId", "dedupeKey");
CREATE INDEX IF NOT EXISTS "notifications_userId_readAt_createdAt_idx"
  ON "notifications"("userId", "readAt", "createdAt");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "userId"    TEXT NOT NULL,
  "inApp"     BOOLEAN NOT NULL DEFAULT true,
  "email"     BOOLEAN NOT NULL DEFAULT true,
  "push"      BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
