-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — RLS Fixes (post-migration)
-- Migration: 006_rls_fixes.sql
-- Applied to production: 2026-06-08
-- Reason: 005_rls_and_grants.sql had two RLS policies that caused
--         infinite recursion on registry.profiles and registry.company_users.
--         This file records the exact SQL applied directly to the live
--         database to fix the issue. 005 has also been patched with the
--         same corrections so fresh migrations no longer need this file —
--         but it is kept for auditability and idempotency.
-- ════════════════════════════════════════════════════════════════

-- ── Step 1: SECURITY DEFINER helper ─────────────────────────────
-- Querying registry.profiles inside a non-SECURITY-DEFINER RLS
-- policy on registry.profiles (own_profile) causes infinite recursion.
-- Querying registry.profiles from within the company_users RLS
-- policy triggers own_profile, which recurses. Both are fixed by
-- delegating the super-admin check to this SECURITY DEFINER function,
-- which bypasses RLS entirely when it runs.
CREATE OR REPLACE FUNCTION registry.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM registry.profiles
    WHERE id = auth.uid() AND is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION registry.is_super_admin TO authenticated;

-- ── Step 2: Fix own_profile (was recursive) ──────────────────────
DROP POLICY IF EXISTS own_profile ON registry.profiles;
CREATE POLICY own_profile ON registry.profiles
  FOR ALL USING (id = auth.uid() OR registry.is_super_admin());

-- ── Step 3: Fix company_users_visibility (was recursive) ─────────
DROP POLICY IF EXISTS company_users_visibility ON registry.company_users;
CREATE POLICY company_users_visibility ON registry.company_users
  USING (user_id = auth.uid() OR registry.is_super_admin());

-- ── Step 4: Disable RLS on companies ─────────────────────────────
-- registry.companies had RLS enabled with no SELECT policy for
-- authenticated users — returning an empty array on every fetch.
-- All authenticated users should be able to read the company list;
-- row-level isolation is not needed here.
ALTER TABLE registry.companies DISABLE ROW LEVEL SECURITY;
