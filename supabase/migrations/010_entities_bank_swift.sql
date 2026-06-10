-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Migration 010
-- Adds bank_swift to registry.entities for international payees.
--
-- Context: IFSC codes are India-only (11-char RBI format).
-- Overseas entities (Hong Kong, Singapore, UAE, etc.) use SWIFT/BIC
-- codes instead. Both fields are stored; the UI shows only the
-- relevant one based on the entity's country.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE registry.entities
  ADD COLUMN IF NOT EXISTS bank_swift TEXT;

COMMENT ON COLUMN registry.entities.bank_swift IS
  'SWIFT/BIC code for international bank transfers. Use instead of bank_ifsc for non-Indian entities.';
