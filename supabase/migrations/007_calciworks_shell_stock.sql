-- ════════════════════════════════════════════════════════════════
-- CALCIWORKS SHELL STOCK LEDGER
-- Migration: 007_calciworks_shell_stock.sql
--
-- CalciWorks is a division of RHHF — NOT a separate legal entity.
-- company_id is always the RHHF UUID.
--
-- Tracks:
--   receipt     (in)  — shells received from RHHF clam processing batch
--   consumption (out) — shells consumed internally (processing/manufacturing)
--   sale        (out) — shells sold to external buyer
--   adjustment  (in/out) — manual stock correction with reason
-- ════════════════════════════════════════════════════════════════

CREATE TABLE suite.shell_stock (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES registry.companies(id), -- always RHHF
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('receipt', 'consumption', 'sale', 'adjustment')),
  direction       TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  quantity_kg     NUMERIC(15,3) NOT NULL CHECK (quantity_kg > 0),
  ref_batch       TEXT,          -- ClamFlow lot or batch reference (for receipts)
  ref_invoice     TEXT,          -- CalciWorks sale invoice number (for sales)
  remarks         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shell_stock_company ON suite.shell_stock(company_id);
CREATE INDEX idx_shell_stock_date    ON suite.shell_stock(entry_date);
CREATE INDEX idx_shell_stock_type    ON suite.shell_stock(entry_type);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE suite.shell_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shell_stock_company_members" ON suite.shell_stock
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM registry.company_users WHERE user_id = auth.uid()
    ) OR registry.is_super_admin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON suite.shell_stock TO authenticated;

-- ── Run this in Supabase SQL editor to apply ─────────────────────
-- (migration file is documentation; run manually until CI is set up)
