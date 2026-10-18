-- Phase 1 free-tier hardening (plan section 11.1): count outbound Resend sends
-- per day so the free plan's daily quota cannot be exhausted silently. Only the
-- kind and the timestamp are stored - never the recipient.

CREATE TABLE IF NOT EXISTS "email_sends" (
  "id"        TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_sends_createdAt_idx" ON "email_sends"("createdAt");
