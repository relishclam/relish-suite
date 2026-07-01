-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Fix entities INSERT RLS
-- Migration: 019_fix_entities_insert_rls.sql
-- Reason:
--   005_rls_and_grants.sql created `entity_visibility` with only a
--   USING clause. PostgreSQL uses USING as WITH CHECK for UPDATE,
--   but for INSERT the new row must satisfy the USING expression
--   evaluated against the new row values.
--
--   The expression includes `created_by = auth.uid()`, which is
--   FALSE when created_by is NULL — blocking any INSERT where the
--   caller forgot to set created_by. Even with the code fix
--   (vendors.js now passes created_by), an explicit INSERT policy
--   is safer and more idiomatic.
--
--   Similarly, entity_roles_visibility only has USING. Adding an
--   explicit WITH CHECK for entity_roles INSERT is belt-and-suspenders.
-- ════════════════════════════════════════════════════════════════

-- ── entities: explicit INSERT policy ─────────────────────────────
-- Any authenticated user with company access may create an entity.
-- This supplements entity_visibility (which governs SELECT/UPDATE/DELETE).
DROP POLICY IF EXISTS entity_insert ON registry.entities;
CREATE POLICY entity_insert ON registry.entities
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- ── entity_roles: explicit INSERT policy ──────────────────────────
-- Users may only insert entity_roles for companies they belong to,
-- or if they are super_admin.
DROP POLICY IF EXISTS entity_roles_insert ON registry.entity_roles;
CREATE POLICY entity_roles_insert ON registry.entity_roles
  FOR INSERT WITH CHECK (
    registry.has_company_access(company_id)
    OR registry.is_super_admin()
  );
