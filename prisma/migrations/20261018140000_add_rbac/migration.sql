-- Phase 1: capability-based RBAC (plan sections 7.2 / 8.1). Additive only: new
-- tables plus a data migration that mirrors today's role + flags into roles.
-- The legacy boolean columns stay (the live Vite app still reads them) and the
-- API keeps mirroring them, so both apps agree until the cutover.

CREATE TABLE IF NOT EXISTS "roles" (
  "id"       TEXT NOT NULL,
  "key"      TEXT NOT NULL,
  "name"     TEXT NOT NULL,
  "system"   BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "roles_key_key" ON "roles"("key");

CREATE TABLE IF NOT EXISTS "role_capabilities" (
  "roleId"     TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  CONSTRAINT "role_capabilities_pkey" PRIMARY KEY ("roleId", "capability"),
  CONSTRAINT "role_capabilities_roleId_fkey" FOREIGN KEY ("roleId")
    REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "role_capabilities_capability_idx" ON "role_capabilities"("capability");

CREATE TABLE IF NOT EXISTS "user_roles" (
  "userId"     TEXT NOT NULL,
  "roleId"     TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedBy" TEXT,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId", "roleId"),
  CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId")
    REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_roles_roleId_idx" ON "user_roles"("roleId");

-- System roles. They reproduce exactly what the boolean flags can express today;
-- the org-chart roles (President, Treasurer, …) map onto these capabilities as
-- later modules need them.
INSERT INTO "roles" ("id", "key", "name", "system") VALUES
  ('role-super-admin',      'super_admin',      'Super administrator', TRUE),
  ('role-staff',            'staff',            'Officer (staff)',     TRUE),
  ('role-client',           'client',           'Officer (client)',    TRUE),
  ('role-student',          'student',          'Student',             TRUE),
  ('role-settings-manager', 'settings_manager', 'Settings manager',    TRUE),
  ('role-delegator',        'delegator',        'May grant delegation',TRUE),
  ('role-content-manager',  'content_manager',  'Content manager',     TRUE)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_capabilities" ("roleId", "capability") VALUES
  -- super admin: everything
  ('role-super-admin', 'admin.all'),
  ('role-super-admin', 'admin.users'),
  ('role-super-admin', 'admin.reference'),
  ('role-super-admin', 'settings.manage'),
  ('role-super-admin', 'staff.access'),
  ('role-super-admin', 'events.manage'),
  ('role-super-admin', 'attendance.record'),
  ('role-super-admin', 'attendance.roster'),
  ('role-super-admin', 'attendance.export'),
  ('role-super-admin', 'delegation.grant'),
  ('role-super-admin', 'content.manage'),
  ('role-super-admin', 'students.manage'),
  ('role-super-admin', 'duties.manage'),
  ('role-super-admin', 'photos.manage'),
  -- staff (officers): the legacy requireStaff surface
  ('role-staff', 'staff.access'),
  ('role-staff', 'events.manage'),
  ('role-staff', 'attendance.record'),
  ('role-staff', 'attendance.roster'),
  ('role-staff', 'attendance.export'),
  ('role-staff', 'duties.manage'),
  ('role-staff', 'photos.manage'),
  -- clients: self-service only (no officer capabilities)
  -- students: student flows are gated by role, not capability
  -- flag-derived roles
  ('role-settings-manager', 'settings.manage'),
  ('role-settings-manager', 'admin.reference'),
  ('role-delegator', 'delegation.grant'),
  ('role-delegator', 'settings.manage'),
  ('role-content-manager', 'content.manage')
ON CONFLICT ("roleId", "capability") DO NOTHING;

-- Backfill from the current role + flags so behaviour is unchanged after deploy.
INSERT INTO "user_roles" ("userId", "roleId")
SELECT u."id", r."id"
FROM "users" u
JOIN "roles" r ON r."key" = u."role"
WHERE NOT EXISTS (
  SELECT 1 FROM "user_roles" ur WHERE ur."userId" = u."id" AND ur."roleId" = r."id"
)
ON CONFLICT DO NOTHING;

INSERT INTO "user_roles" ("userId", "roleId")
SELECT u."id", 'role-delegator'
FROM "users" u
WHERE u."canDelegate" = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO "user_roles" ("userId", "roleId")
SELECT u."id", 'role-settings-manager'
FROM "users" u
WHERE u."canConfigure" = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO "user_roles" ("userId", "roleId")
SELECT u."id", 'role-content-manager'
FROM "users" u
WHERE u."canManageContent" = TRUE
ON CONFLICT DO NOTHING;
