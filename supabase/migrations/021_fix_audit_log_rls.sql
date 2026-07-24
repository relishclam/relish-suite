-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Fix audit_log INSERT permissions
-- Migration: 021_fix_audit_log_rls.sql
-- Reason:
--   Migration 014 granted only SELECT on all registry tables to
--   authenticated. registry.audit_log needs INSERT so the app can
--   write audit entries when users are added / edited / deleted.
--
--   suite.audit_log also lacked RLS enforcement (ALL was granted
--   in migration 014 but no RLS policies were created).
--
--   Error seen in production:
--     POST /rest/v1/audit_log → 403 Forbidden
--     code: 42501 "permission denied for table audit_log"
-- ════════════════════════════════════════════════════════════════

-- ── registry.audit_log ────────────────────────────────────────────

-- 1. Grant INSERT + sequence usage so authenticated users can write logs.
GRANT INSERT                        ON registry.audit_log            TO authenticated;
GRANT USAGE, SELECT                 ON SEQUENCE registry.audit_log_id_seq TO authenticated;

-- 2. Enable RLS (append-only; authenticated may insert and read own company rows).
ALTER TABLE registry.audit_log ENABLE ROW LEVEL SECURITY;

-- 3. INSERT: any authenticated user may append a row.
DROP POLICY IF EXISTS audit_log_insert ON registry.audit_log;
CREATE POLICY audit_log_insert ON registry.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. SELECT: authenticated users can read logs for companies they belong to.
DROP POLICY IF EXISTS audit_log_read ON registry.audit_log;
CREATE POLICY audit_log_read ON registry.audit_log
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM registry.company_users
      WHERE user_id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies — audit_log is append-only by design.

-- ── suite.audit_log ───────────────────────────────────────────────
-- Migration 014 gave GRANT ALL on suite schema, so INSERT is already
-- permitted. Enable RLS with matching policies to enforce company isolation.

ALTER TABLE suite.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_insert ON suite.audit_log;
CREATE POLICY audit_log_insert ON suite.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS audit_log_read ON suite.audit_log;
CREATE POLICY audit_log_read ON suite.audit_log
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id
      FROM registry.company_users
      WHERE user_id = auth.uid()
    )
  );
