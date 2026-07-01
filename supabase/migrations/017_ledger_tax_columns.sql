-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Ledger Tax Classification
-- Migration: 017_ledger_tax_columns.sql
-- Purpose:
--   Add GST/tax classification columns to pramaana.ledgers so that
--   the system can:
--     1. Identify which ledgers are tax ledgers (Output GST, Input GST,
--        TDS Payable, etc.) vs income/expense/asset/liability ledgers.
--     2. Auto-split CGST / SGST / IGST amounts from voucher_entries
--        for GSTR-1 / GSTR-3B reports.
--     3. Power the GST Quick-Add panel in VoucherEntry — auto-populate
--        tax ledger rows when the user enters a taxable amount + rate.
--
-- Usage:
--   Mark a ledger as a tax ledger in Pramaana → Ledgers → Edit →
--   toggle "GST / Tax Ledger" ON, pick the tax type (CGST / SGST /
--   IGST / CESS / TDS / TCS) and set the default rate.
--
--   Examples:
--     "Output CGST Payable"  → is_tax_ledger=T, tax_type='CGST', tax_rate=9.00
--     "Output SGST Payable"  → is_tax_ledger=T, tax_type='SGST', tax_rate=9.00
--     "Output IGST Payable"  → is_tax_ledger=T, tax_type='IGST', tax_rate=18.00
--     "Input CGST"           → is_tax_ledger=T, tax_type='CGST', tax_rate=9.00
--     "Input IGST"           → is_tax_ledger=T, tax_type='IGST', tax_rate=18.00
--     "TDS Payable"          → is_tax_ledger=T, tax_type='TDS',  tax_rate=10.00
-- ════════════════════════════════════════════════════════════════

-- NOTE: This migration was manually applied via the Supabase SQL editor
-- on 2026-07-01. It is committed here for schema tracking only.

ALTER TABLE pramaana.ledgers
  ADD COLUMN IF NOT EXISTS is_tax_ledger  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tax_type       TEXT        CHECK (tax_type IN ('CGST','SGST','IGST','CESS','TDS','TCS')),
  ADD COLUMN IF NOT EXISTS tax_rate       NUMERIC(5,2);

-- Index for fast lookups: "give me all CGST ledgers for company X"
CREATE INDEX IF NOT EXISTS idx_ledgers_tax_type
  ON pramaana.ledgers (company_id, tax_type)
  WHERE is_tax_ledger = TRUE;
