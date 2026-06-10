-- ████████████████████████████████████████████████████████████████
-- ██                                                            ██
-- ██   PRE-DEPLOYMENT DATA RESET — PRAMAANA FUNCTIONAL GO-LIVE ██
-- ██                                                            ██
-- ██   THIS IS NOT A MIGRATION. DO NOT RUN ON AUTO-DEPLOY.     ██
-- ██   RUN ONCE, MANUALLY, IN SUPABASE SQL EDITOR, BEFORE      ██
-- ██   FUNCTIONAL DEPLOYMENT OF PRAMAANA.                      ██
-- ██                                                            ██
-- ██   WHAT THIS DELETES:                                       ██
-- ██     - All entity master data (test vendors, staff, etc.)  ██
-- ██     - All Pramaana ledgers, vouchers, and related data     ██
-- ██     - All Suite transactional data (POs, invoices, etc.)  ██
-- ██     - Sequence counters (resets numbering to 0)           ██
-- ██                                                            ██
-- ██   WHAT THIS PRESERVES:                                     ██
-- ██     - registry.companies (RHHF, RFPL — seeded)            ██
-- ██     - registry.profiles + company_users (real users)      ██
-- ██     - pramaana.ledger_groups (seeded — 25 rows)           ██
-- ██     - pramaana.voucher_types (seeded — 6 rows)            ██
-- ██     - suite.tally_config (real Tally company names)       ██
-- ██                                                            ██
-- ██   CONFIRM before running:                                  ██
-- ██     SELECT COUNT(*) FROM registry.entities;               ██
-- ██     SELECT COUNT(*) FROM pramaana.vouchers;               ██
-- ██     SELECT COUNT(*) FROM suite.purchase_orders;           ██
-- ██   If all are test data, proceed.                          ██
-- ██                                                            ██
-- ████████████████████████████████████████████████████████████████

BEGIN;

-- ── Step 1: Pramaana transactional data ──────────────────────────
-- Order matters — delete children before parents.

TRUNCATE TABLE pramaana.voucher_attachments       CASCADE;
TRUNCATE TABLE pramaana.voucher_line_items        CASCADE;
TRUNCATE TABLE pramaana.voucher_entries           CASCADE;
TRUNCATE TABLE pramaana.suspense_settlements      CASCADE;
TRUNCATE TABLE pramaana.settlement_sessions       CASCADE;
TRUNCATE TABLE pramaana.vouchers                  CASCADE;
TRUNCATE TABLE pramaana.period_locks              CASCADE;
TRUNCATE TABLE pramaana.approval_actions          CASCADE;
TRUNCATE TABLE pramaana.approval_rules            CASCADE;
TRUNCATE TABLE pramaana.capture_sessions          CASCADE;
TRUNCATE TABLE pramaana.audit_log                 CASCADE;
TRUNCATE TABLE pramaana.gst_details               CASCADE;
TRUNCATE TABLE pramaana.notifications             CASCADE;
TRUNCATE TABLE pramaana.push_subscriptions        CASCADE;
TRUNCATE TABLE pramaana.otp_sessions              CASCADE;

-- Delete user-created ledgers only.
-- Preserve: ledger_groups and voucher_types (seeded, fixed UUIDs).
DELETE FROM pramaana.ledgers;
DELETE FROM pramaana.cost_centres;

-- ── Step 2: Suite transactional data ─────────────────────────────

TRUNCATE TABLE suite.po_line_items                CASCADE;
TRUNCATE TABLE suite.purchase_orders              CASCADE;
TRUNCATE TABLE suite.invoice_line_items           CASCADE;
TRUNCATE TABLE suite.invoice_packing_lines        CASCADE;
TRUNCATE TABLE suite.invoices                     CASCADE;
TRUNCATE TABLE suite.shell_stock                  CASCADE;
TRUNCATE TABLE suite.tally_exports                CASCADE;
TRUNCATE TABLE suite.activity_feed                CASCADE;
TRUNCATE TABLE suite.kpi_snapshots                CASCADE;

-- Delete products and delivery addresses (usually re-entered at go-live).
DELETE FROM suite.products;
DELETE FROM suite.delivery_addresses;

-- Preserve suite.tally_config — contains real Tally company names.

-- ── Step 3: Registry entity master ───────────────────────────────
-- entity_roles must be deleted before entities (FK).

DELETE FROM registry.entity_roles;
DELETE FROM registry.biometrics;
DELETE FROM registry.entities;

-- Preserve: registry.companies, registry.profiles, registry.company_users,
--           registry.app_access (real user accounts stay intact)

-- ── Step 4: Sequence counters reset ──────────────────────────────
-- Document numbers restart from 1 at go-live.
-- Preserves the counter rows (one per company/prefix), sets count to 0.
UPDATE registry.sequence_counters SET current_value = 0;

-- ── Step 5: Audit log ─────────────────────────────────────────────
-- Optional: uncomment to clear test audit trail.
-- TRUNCATE TABLE registry.audit_log CASCADE;

COMMIT;

-- ── Verification queries (run after COMMIT) ───────────────────────
-- SELECT COUNT(*) AS entities           FROM registry.entities;        -- expect 0
-- SELECT COUNT(*) AS entity_roles       FROM registry.entity_roles;    -- expect 0
-- SELECT COUNT(*) AS purchase_orders    FROM suite.purchase_orders;    -- expect 0
-- SELECT COUNT(*) AS vouchers           FROM pramaana.vouchers;        -- expect 0
-- SELECT COUNT(*) AS ledgers            FROM pramaana.ledgers;         -- expect 0
-- SELECT COUNT(*) AS ledger_groups      FROM pramaana.ledger_groups;   -- expect 25 (preserved)
-- SELECT COUNT(*) AS voucher_types      FROM pramaana.voucher_types;   -- expect 6 (preserved)
-- SELECT COUNT(*) AS companies          FROM registry.companies;       -- expect 2 (preserved)
-- SELECT COUNT(*) AS profiles           FROM registry.profiles;        -- expect N (preserved)
