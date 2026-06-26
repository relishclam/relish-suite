-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — User Management Fixes
-- Migration: 014_user_management_fixes.sql
-- Fixes:
--   1. audit_edit_enabled flag on company_users (auditor temp-edit)
--   2. Auto-create registry.profiles when auth.users is inserted
--   3. Re-apply schema grants + ALTER DEFAULT PRIVILEGES so that
--      all tables added after migration 005 are covered.
-- ════════════════════════════════════════════════════════════════

-- ── 1. Audit-edit flag ─────────────────────────────────────────
-- Allows Super Admin / Admin to temporarily grant an Auditor the
-- ability to rename ledgers and move vouchers between ledgers.
-- Scoped per company_users row (per user per company).
ALTER TABLE registry.company_users
  ADD COLUMN IF NOT EXISTS audit_edit_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Profile auto-create trigger ────────────────────────────
-- Fires AFTER INSERT on auth.users so every invited / signing-up
-- user immediately gets a registry.profiles row.
-- full_name is seeded from raw_user_meta_data if the invite flow
-- passes it; otherwise defaults to empty string (NOT NULL constraint).
-- Also backfills any existing auth.users rows that were created before
-- this migration and still lack a registry.profiles entry.
INSERT INTO registry.profiles (id, email, full_name, is_active, is_super_admin)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  TRUE,
  FALSE
FROM auth.users AS u
LEFT JOIN registry.profiles AS p ON p.id = u.id
WHERE p.id IS NULL;

CREATE OR REPLACE FUNCTION registry.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as owner, bypasses RLS
SET search_path = registry, public
AS $$
BEGIN
  INSERT INTO registry.profiles (id, email, full_name, is_active, is_super_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    TRUE,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;   -- safe if the row already exists
  RETURN NEW;
END;
$$;

-- Drop + recreate so the function definition is always up to date.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION registry.handle_new_user();

-- ── 3. Schema grants — re-apply + add default privileges ──────
-- "GRANT … ON ALL TABLES" only covers tables existing at the time
-- it runs.  ALTER DEFAULT PRIVILEGES covers all FUTURE tables.
-- Running both ensures full coverage regardless of migration order.

-- Schema usage
GRANT USAGE ON SCHEMA registry TO authenticated;
GRANT USAGE ON SCHEMA suite     TO authenticated;
GRANT USAGE ON SCHEMA pramaana  TO authenticated;
GRANT USAGE ON SCHEMA clamflow  TO authenticated;

-- registry: read-only for authenticated; write to own profile handled by RLS
GRANT SELECT         ON ALL TABLES    IN SCHEMA registry  TO authenticated;
GRANT UPDATE         ON registry.profiles                  TO authenticated;
GRANT INSERT, UPDATE ON registry.company_users             TO authenticated;

-- suite, pramaana, clamflow: full CRUD (RLS enforces company isolation)
GRANT ALL ON ALL TABLES     IN SCHEMA suite     TO authenticated;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA suite     TO authenticated;
GRANT ALL ON ALL TABLES     IN SCHEMA pramaana  TO authenticated;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA pramaana  TO authenticated;
GRANT ALL ON ALL TABLES     IN SCHEMA clamflow  TO authenticated;
GRANT ALL ON ALL SEQUENCES  IN SCHEMA clamflow  TO authenticated;

-- Default privileges: automatically granted to future tables/sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA registry  GRANT SELECT        ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA suite      GRANT ALL           ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA suite      GRANT ALL           ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA pramaana   GRANT ALL           ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA pramaana   GRANT ALL           ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA clamflow   GRANT ALL           ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA clamflow   GRANT ALL           ON SEQUENCES TO authenticated;
