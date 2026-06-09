-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Pramaana Ledger Bank Fields
-- Migration: 009_ledger_bank_fields.sql
-- Adds bank account fields to pramaana.ledgers
-- Run in: mmkbknnzgpvsqgnynrbe
-- ════════════════════════════════════════════════════════════════
ALTER TABLE pramaana.ledgers
  ADD COLUMN IF NOT EXISTS is_bank_account  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bank_name        TEXT,
  ADD COLUMN IF NOT EXISTS account_number   TEXT,
  ADD COLUMN IF NOT EXISTS ifsc             TEXT;
