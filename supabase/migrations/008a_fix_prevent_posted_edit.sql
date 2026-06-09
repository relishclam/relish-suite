-- ════════════════════════════════════════════════════════════════
-- PATCH: Fix fn_prevent_posted_edit for DELETE path
-- Migration: 008a_fix_prevent_posted_edit.sql
-- Applies to: 008_pramaana_schema.sql (already applied)
-- Problem: RETURN NEW on DELETE trigger fails — there is no NEW row.
-- Fix: Explicit TG_OP = 'DELETE' branch returning OLD.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pramaana.fn_prevent_posted_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted', 'cancelled') THEN
      RAISE EXCEPTION 'Cannot delete a % voucher. Number: %', OLD.status, OLD.voucher_number;
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE path
  IF OLD.status IN ('posted', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot modify a % voucher. Number: %', OLD.status, OLD.voucher_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
