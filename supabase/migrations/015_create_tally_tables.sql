-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Tally tables bootstrap / repair
-- Migration: 015_create_tally_tables.sql
-- Purpose:
--   1) Ensure suite.tally_config exists (Master Data → Tally Config)
--   2) Ensure suite.tally_exports exists with required columns
--   3) Ensure RLS + policies + grants for authenticated users
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1) Tally configuration table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suite.tally_config (
  company_id         UUID PRIMARY KEY REFERENCES registry.companies(id) ON DELETE CASCADE,
  tally_company_name TEXT NOT NULL,
  cash_ledger        TEXT NOT NULL DEFAULT 'Cash',
  upi_ledger         TEXT NOT NULL DEFAULT 'UPI',
  bank_ledger        TEXT NOT NULL DEFAULT 'Bank Account',
  tally_server_url   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tally_config_company ON suite.tally_config(company_id);

-- ────────────────────────────────────────────────────────────────
-- 2) Tally exports table (create if missing; align expected columns)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suite.tally_exports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES registry.companies(id) ON DELETE CASCADE,
  voucher_id     UUID NOT NULL,
  voucher_serial TEXT,
  voucher_amount NUMERIC(15,2) DEFAULT 0,
  voucher_date   TIMESTAMPTZ,
  payee_name     TEXT,
  payment_mode   TEXT,
  export_type    TEXT,
  xml_payload    TEXT,
  batch_id       UUID,
  export_status  TEXT NOT NULL DEFAULT 'exported' CHECK (export_status IN ('exported','re-exported','failed')),
  error_message  TEXT,
  tally_response TEXT,
  exported_by    UUID REFERENCES auth.users(id),
  exported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS voucher_serial TEXT;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS voucher_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS voucher_date TIMESTAMPTZ;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS payee_name TEXT;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS export_type TEXT;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS xml_payload TEXT;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS export_status TEXT DEFAULT 'exported';
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS tally_response TEXT;
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS exported_by UUID REFERENCES auth.users(id);
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE suite.tally_exports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_tally_exports_company      ON suite.tally_exports(company_id);
CREATE INDEX IF NOT EXISTS idx_tally_exports_exported_at  ON suite.tally_exports(exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_tally_exports_batch_id     ON suite.tally_exports(batch_id);
CREATE INDEX IF NOT EXISTS idx_tally_exports_voucher_id   ON suite.tally_exports(voucher_id);

-- ────────────────────────────────────────────────────────────────
-- 3) RLS + policies
-- ────────────────────────────────────────────────────────────────
ALTER TABLE suite.tally_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE suite.tally_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_isolation_tally_config ON suite.tally_config;
CREATE POLICY company_isolation_tally_config ON suite.tally_config
  USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

DROP POLICY IF EXISTS company_isolation_tally_exports ON suite.tally_exports;
CREATE POLICY company_isolation_tally_exports ON suite.tally_exports
  USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

-- ────────────────────────────────────────────────────────────────
-- 4) Grants
-- ────────────────────────────────────────────────────────────────
GRANT ALL ON TABLE suite.tally_config  TO authenticated;
GRANT ALL ON TABLE suite.tally_exports TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- Verification queries (optional):
-- select * from suite.tally_config limit 1;
-- select * from suite.tally_exports limit 1;
-- ════════════════════════════════════════════════════════════════
