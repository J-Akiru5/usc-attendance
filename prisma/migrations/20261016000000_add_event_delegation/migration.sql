-- Phase 1: temporary per-event delegation
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "canDelegate" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "event_delegates" (
  "id"        TEXT NOT NULL,
  "eventId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "scopes"    TEXT[] NOT NULL,
  "grantedBy" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_delegates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_delegates_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_delegates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_delegates_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_delegates_revokedBy_fkey" FOREIGN KEY ("revokedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "event_delegates_eventId_userId_idx" ON "event_delegates"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "event_delegates_userId_expiresAt_idx" ON "event_delegates"("userId", "expiresAt");

-- RLS default-deny, consistent with the rest of the schema (API layer enforces access)
ALTER TABLE "event_delegates" ENABLE ROW LEVEL SECURITY;
