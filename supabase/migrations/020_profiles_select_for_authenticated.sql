-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Allow authenticated users to read profile names
-- Migration: 020_profiles_select_for_authenticated.sql
-- Reason:
--   The existing `own_profile` policy (FOR ALL) restricts profile
--   reads to id = auth.uid() or super_admin. This blocked Pramaana
--   from looking up approver/creator full_names on voucher PDFs,
--   causing "Unknown" to appear instead of the actual name.
--
--   Adding a separate FOR SELECT policy (PostgreSQL ORs permissive
--   policies together) allows any authenticated user to read profile
--   rows for name lookups, while INSERT/UPDATE/DELETE remain fully
--   restricted to own_profile only.
-- ════════════════════════════════════════════════════════════════

CREATE POLICY profile_names_readable ON registry.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
