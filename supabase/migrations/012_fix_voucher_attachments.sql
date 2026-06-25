-- ════════════════════════════════════════════════════════════════
-- Migration: 012_fix_voucher_attachments.sql
-- Fix pramaana.voucher_attachments column names to match app code.
--
-- Original DDL (008) used: file_url, file_size_bytes (no soft-delete).
-- App code (attachments.ts) expects: storage_path, file_size, is_deleted.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE pramaana.voucher_attachments
  DROP COLUMN IF EXISTS file_url,
  DROP COLUMN IF EXISTS file_size_bytes,
  ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_size    INT,
  ADD COLUMN IF NOT EXISTS is_deleted   BOOLEAN NOT NULL DEFAULT FALSE;

-- Remove temporary default — storage_path must always be supplied on insert
ALTER TABLE pramaana.voucher_attachments
  ALTER COLUMN storage_path DROP DEFAULT;

-- Add indexes (IF NOT EXISTS — safe to re-run)
CREATE INDEX IF NOT EXISTS idx_vattach_voucher ON pramaana.voucher_attachments(voucher_id);
CREATE INDEX IF NOT EXISTS idx_vattach_active  ON pramaana.voucher_attachments(voucher_id) WHERE is_deleted = FALSE;
