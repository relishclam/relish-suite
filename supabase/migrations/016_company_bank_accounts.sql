-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Company Bank Accounts
-- Migration: 016_company_bank_accounts.sql
-- Purpose:
--   Create registry.company_bank_accounts — a shared, platform-wide
--   table storing bank details for each legal entity. Any Relish app
--   (Suite, Pramaana, ClamFlow) can read from here instead of
--   maintaining its own per-app bank account list.
--
--   Replaces pramaana.company_payment_accounts (label-only table)
--   for the "Pay From" dropdown in Pramaana. The old table is kept
--   for safety — no data is dropped.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS registry.company_bank_accounts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID        NOT NULL REFERENCES registry.companies(id) ON DELETE CASCADE,
  label                TEXT        NOT NULL,              -- e.g. "RHHF HDFC Current A/C"
  account_holder_name  TEXT,
  bank_name            TEXT,
  bank_account_number  TEXT,
  bank_ifsc            TEXT,
  upi_id               TEXT,
  is_primary           BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one primary account per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_bank_accounts_primary
  ON registry.company_bank_accounts (company_id)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_company
  ON registry.company_bank_accounts (company_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION registry.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_bank_accounts_updated_at ON registry.company_bank_accounts;
CREATE TRIGGER trg_company_bank_accounts_updated_at
  BEFORE UPDATE ON registry.company_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION registry.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- registry.companies has RLS disabled (all authenticated users can see companies).
-- Bank accounts follow the same pattern: readable by all authenticated users,
-- writable only by users with access to that company (or super_admin).
ALTER TABLE registry.company_bank_accounts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read bank accounts
DROP POLICY IF EXISTS "bank_accounts_select" ON registry.company_bank_accounts;
CREATE POLICY "bank_accounts_select"
  ON registry.company_bank_accounts
  FOR SELECT TO authenticated
  USING (true);

-- Only company members (or super_admin) can insert/update/delete
DROP POLICY IF EXISTS "bank_accounts_write" ON registry.company_bank_accounts;
CREATE POLICY "bank_accounts_write"
  ON registry.company_bank_accounts
  FOR ALL TO authenticated
  USING  (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

-- Service role has full access (edge functions, server actions)
DROP POLICY IF EXISTS "bank_accounts_service_role" ON registry.company_bank_accounts;
CREATE POLICY "bank_accounts_service_role"
  ON registry.company_bank_accounts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE
  ON registry.company_bank_accounts
  TO authenticated, service_role;
