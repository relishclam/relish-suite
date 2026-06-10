-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Migration 011
-- Adds local registration fields for overseas entities.
--
-- Rationale:
--   GSTIN  = India GST Identification Number (India-only)
--   PAN    = Income Tax Permanent Account Number (India-only)
--
--   Overseas entities (Hong Kong, Singapore, UAE, etc.) have their
--   own registration systems:
--     HK  → Business Registration Certificate (BRC) number
--     SG  → Unique Entity Number (UEN)
--     UAE → Commercial Registration / TRN
--     UK  → Companies House number / VAT Registration
--     US  → EIN / State registration
--
--   Two generic columns cover all cases:
--     local_reg_number  → Company / Business registration number
--     local_tax_number  → Tax / VAT / GST registration number
--
--   The UI shows GSTIN + PAN for India, and these two fields for
--   all other countries. Both sets are stored in separate columns
--   so Indian and overseas entities never collide.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE registry.entities
  ADD COLUMN IF NOT EXISTS local_reg_number  TEXT,
  ADD COLUMN IF NOT EXISTS local_tax_number  TEXT;

COMMENT ON COLUMN registry.entities.local_reg_number IS
  'Company / Business registration number for non-Indian entities (BRC, UEN, CRN, etc.)';
COMMENT ON COLUMN registry.entities.local_tax_number IS
  'Tax / VAT / GST registration number for non-Indian entities';
