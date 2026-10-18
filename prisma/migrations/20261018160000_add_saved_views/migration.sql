-- Phase 1: saved table views (plan section 8.1, useDataTable). Additive only.
-- One row per user + resource + name; the query string is the same one the
-- table puts in the URL, so restoring a view is just navigating to it.

CREATE TABLE IF NOT EXISTS "saved_views" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "resource"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "query"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_views_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "saved_views_userId_resource_name_key"
  ON "saved_views"("userId", "resource", "name");
