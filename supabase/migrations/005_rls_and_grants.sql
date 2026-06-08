-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — RLS Policies + Schema Grants
-- Migration: 005_rls_and_grants.sql
-- Source: RELISH_SUITE_SPEC_V2.md Sections 5 and 6
-- Prerequisite: 001–004 have all run successfully.
-- Order: helper function → registry RLS → suite RLS → grants
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- PART 1: HELPER FUNCTION
-- Must be created before any RLS policy that calls it.
-- SECURITY DEFINER: runs with owner privileges so RLS policies
-- can query company_users + profiles without infinite recursion.
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION registry.has_company_access(p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM registry.company_users
    WHERE user_id = auth.uid() AND company_id = p_company_id
  ) OR EXISTS (
    SELECT 1 FROM registry.profiles
    WHERE id = auth.uid() AND is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION registry.has_company_access TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- is_super_admin: SECURITY DEFINER helper used by RLS policies.
-- Querying registry.profiles inside a plain RLS expression causes
-- infinite recursion. This function bypasses RLS when it runs.
-- ────────────────────────────────────────────────────────────────
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

-- ════════════════════════════════════════════════════════════════
-- PART 2: ENABLE ROW LEVEL SECURITY — registry tables
-- ════════════════════════════════════════════════════════════════
ALTER TABLE registry.entities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.entity_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.biometrics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.company_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.onboarding_queue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.visitors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.profiles          ENABLE ROW LEVEL SECURITY;
-- registry.companies: all authenticated users can read the company list — no policy needed.
ALTER TABLE registry.companies         DISABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════
-- PART 3: RLS POLICIES — registry tables
-- ════════════════════════════════════════════════════════════════

-- ── entities ────────────────────────────────────────────────────
-- Visible if:
--   a) is_global = TRUE (e.g. government bodies, shared payees)
--   b) the user created it
--   c) the user has access to any company where this entity has a role
--   d) user is super_admin
CREATE POLICY entity_visibility ON registry.entities
  USING (
    is_global = TRUE
    OR created_by = auth.uid()
    OR id IN (
      SELECT er.entity_id FROM registry.entity_roles er
      WHERE registry.has_company_access(er.company_id)
    )
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ── biometrics ───────────────────────────────────────────────────
-- SELECT: only hr, operations, super_admin
-- INSERT: only hr, super_admin
-- Pramaana (accounts, auditor) and Suite dashboard CANNOT read this table.
CREATE POLICY biometrics_select ON registry.biometrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM registry.company_users
      WHERE user_id = auth.uid() AND role IN ('hr','operations')
    )
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

CREATE POLICY biometrics_insert ON registry.biometrics
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM registry.company_users
      WHERE user_id = auth.uid() AND role IN ('hr')
    )
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

CREATE POLICY biometrics_update ON registry.biometrics
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM registry.company_users
      WHERE user_id = auth.uid() AND role IN ('hr','operations')
    )
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ── attendance ────────────────────────────────────────────────────
-- Visible to: the person themselves + hr/admin/operations/super_admin
-- for the relevant company.
CREATE POLICY attendance_visibility ON registry.attendance
  USING (
    entity_id IN (
      SELECT entity_id FROM registry.profiles WHERE id = auth.uid()
    )
    OR registry.has_company_access(company_id)
  );

CREATE POLICY attendance_insert ON registry.attendance
  FOR INSERT WITH CHECK (
    -- ClamFlow writes attendance on behalf of entities (face recognition)
    -- Any authenticated user with company access can insert
    registry.has_company_access(company_id)
  );

-- ── profiles ─────────────────────────────────────────────────────
-- Users see and modify only their own profile row.
-- Super admin access uses registry.is_super_admin() (SECURITY DEFINER)
-- to avoid infinite recursion — a direct EXISTS on registry.profiles
-- inside this policy would recurse indefinitely.
CREATE POLICY own_profile ON registry.profiles
  FOR ALL USING (
    id = auth.uid()
    OR registry.is_super_admin()
  );

-- ── company_users ─────────────────────────────────────────────────
-- Users see their own company_users rows.
-- Super admin sees all. Uses registry.is_super_admin() (SECURITY DEFINER)
-- to avoid triggering own_profile RLS when reading registry.profiles.
CREATE POLICY company_users_visibility ON registry.company_users
  USING (
    user_id = auth.uid()
    OR registry.is_super_admin()
  );

-- ── onboarding_queue ─────────────────────────────────────────────
-- Visible to: submitter, HR/admin for the company, super_admin
CREATE POLICY onboarding_access ON registry.onboarding_queue
  USING (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM registry.company_users
      WHERE user_id = auth.uid()
        AND company_id = onboarding_queue.company_id
        AND role IN ('hr','admin')
    )
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ── visitors ─────────────────────────────────────────────────────
-- Visible to: registrant, hr/admin for the company, super_admin
CREATE POLICY visitors_visibility ON registry.visitors
  USING (
    registered_by = auth.uid()
    OR (
      company_id IS NOT NULL
      AND registry.has_company_access(company_id)
    )
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ── entity_roles ─────────────────────────────────────────────────
-- Visible if user has access to the company this role belongs to.
CREATE POLICY entity_roles_visibility ON registry.entity_roles
  USING (
    registry.has_company_access(company_id)
    OR EXISTS (
      SELECT 1 FROM registry.profiles
      WHERE id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ════════════════════════════════════════════════════════════════
-- PART 4: ENABLE ROW LEVEL SECURITY — suite tables
-- ════════════════════════════════════════════════════════════════
ALTER TABLE suite.purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.po_line_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.invoice_line_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.invoice_packing_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.delivery_addresses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.kpi_snapshots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.activity_feed         ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════
-- PART 5: RLS POLICIES — suite tables
-- Company isolation: users see only records for their assigned companies.
-- ════════════════════════════════════════════════════════════════

-- ── purchase_orders ───────────────────────────────────────────────
CREATE POLICY company_isolation ON suite.purchase_orders
  USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

-- ── invoices ─────────────────────────────────────────────────────
CREATE POLICY company_isolation ON suite.invoices
  USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

-- ── products ─────────────────────────────────────────────────────
CREATE POLICY company_isolation ON suite.products
  USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

-- ── delivery_addresses ────────────────────────────────────────────
CREATE POLICY company_isolation ON suite.delivery_addresses
  USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

-- ── kpi_snapshots ─────────────────────────────────────────────────
-- NULL company_id = group-level KPI, visible to all authenticated users.
CREATE POLICY company_isolation ON suite.kpi_snapshots
  USING (
    company_id IS NULL
    OR registry.has_company_access(company_id)
  )
  WITH CHECK (
    company_id IS NULL
    OR registry.has_company_access(company_id)
  );

-- ── activity_feed ─────────────────────────────────────────────────
CREATE POLICY company_isolation ON suite.activity_feed
  USING (
    company_id IS NULL
    OR registry.has_company_access(company_id)
  )
  WITH CHECK (
    company_id IS NULL
    OR registry.has_company_access(company_id)
  );

-- ── po_line_items ─────────────────────────────────────────────────
-- Inherit access through parent purchase_order.
CREATE POLICY via_purchase_order ON suite.po_line_items
  USING (
    po_id IN (
      SELECT id FROM suite.purchase_orders
      WHERE registry.has_company_access(company_id)
    )
  )
  WITH CHECK (
    po_id IN (
      SELECT id FROM suite.purchase_orders
      WHERE registry.has_company_access(company_id)
    )
  );

-- ── invoice_line_items ────────────────────────────────────────────
-- Inherit access through parent invoice.
CREATE POLICY via_invoice ON suite.invoice_line_items
  USING (
    invoice_id IN (
      SELECT id FROM suite.invoices
      WHERE registry.has_company_access(company_id)
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM suite.invoices
      WHERE registry.has_company_access(company_id)
    )
  );
  );

-- ── invoice_packing_lines ─────────────────────────────────────────
-- Inherit access through parent invoice.
CREATE POLICY via_invoice_packing ON suite.invoice_packing_lines
  USING (
    invoice_id IN (
      SELECT id FROM suite.invoices
      WHERE registry.has_company_access(company_id)
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM suite.invoices
      WHERE registry.has_company_access(company_id)
    )
  );

-- ════════════════════════════════════════════════════════════════
-- PART 6: SCHEMA GRANTS
-- Source: RELISH_SUITE_SPEC_V2.md Section 6
-- Note: pramaana and clamflow schemas are empty until their DDLs run.
-- GRANT statements here are forward-compatible — they will apply
-- to tables created later in those schemas.
-- ════════════════════════════════════════════════════════════════

-- Schema usage
GRANT USAGE ON SCHEMA registry  TO authenticated;
GRANT USAGE ON SCHEMA suite      TO authenticated;
GRANT USAGE ON SCHEMA pramaana   TO authenticated;
GRANT USAGE ON SCHEMA clamflow   TO authenticated;

-- Registry: authenticated users can SELECT all tables
-- Biometrics is further restricted by RLS above
GRANT SELECT ON ALL TABLES IN SCHEMA registry TO authenticated;
-- ClamFlow writes attendance check-in/out to registry
GRANT INSERT ON registry.attendance TO authenticated;

-- Suite: full CRUD (RLS enforces company isolation)
GRANT ALL ON ALL TABLES IN SCHEMA suite TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA suite TO authenticated;

-- Pramaana: full access when DDL runs (RLS will enforce company isolation)
GRANT ALL ON ALL TABLES IN SCHEMA pramaana TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pramaana TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pramaana TO authenticated;

-- ClamFlow: full access when DDL runs (RLS will enforce company isolation)
GRANT ALL ON ALL TABLES IN SCHEMA clamflow TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA clamflow TO authenticated;

-- Sequence functions available to all apps
GRANT EXECUTE ON FUNCTION registry.next_fy_sequence  TO authenticated;
GRANT EXECUTE ON FUNCTION registry.next_cal_sequence TO authenticated;
