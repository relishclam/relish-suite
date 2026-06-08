-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Pramaana Schema DDL
-- Migration: 008_pramaana_schema.sql
-- Target:    Supabase project mmkbknnzgpvsqgnynrbe (Suite)
-- Schema:    pramaana (created in 001_create_schemas.sql)
-- Prerequisites: migrations 001–007 applied
--
-- Pramaana = accounts + voucher + payment approval module.
-- Auth:      registry.profiles.is_super_admin + registry.company_users.role
--            NO separate Pramaana auth tables.
-- Sequences: registry.next_fy_sequence() — RHHF/PYMT/2526/0001
-- Entities:  registry.entities — all party lookups via entity_id
-- CalciWorks is NOT a company. It is a pramaana.cost_centres row under RHHF.
--
-- Every Supabase JS query uses:
--   .schema('pramaana') for these tables
--   .schema('registry') for entity / company / sequence lookups
--
-- EXECUTION ORDER:
--   1. Trigger helper functions (set_updated_at, prevent_posted_edit,
--      validate_voucher_balance) — fn_audit_voucher is defined after
--      pramaana.audit_log is created in Section 19.
--   2. Tables 1–18
--   3. pramaana.audit_log (Section 19)
--   4. fn_audit_voucher() function (references pramaana.audit_log)
--   5. RLS enable + policies
--   6. Grants
--   7. Triggers
-- ════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- TRIGGER HELPER FUNCTIONS
-- fn_audit_voucher is intentionally NOT defined here.
-- It requires pramaana.audit_log to exist — see Section 19.
-- ════════════════════════════════════════════════════════════════

-- ── 1. updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pramaana.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Prevent editing a posted or cancelled voucher ──────────────
CREATE OR REPLACE FUNCTION pramaana.fn_prevent_posted_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('posted', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot modify a % voucher. Number: %', OLD.status, OLD.voucher_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Validate Dr = Cr when status transitions to 'posted' ───────
CREATE OR REPLACE FUNCTION pramaana.fn_validate_voucher_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_dr NUMERIC;
  v_cr NUMERIC;
BEGIN
  IF NEW.status = 'posted' AND (OLD.status IS DISTINCT FROM 'posted') THEN
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'Dr' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN entry_type = 'Cr' THEN amount ELSE 0 END), 0)
    INTO v_dr, v_cr
    FROM pramaana.voucher_entries
    WHERE voucher_id = NEW.id;

    IF v_dr = 0 AND v_cr = 0 THEN
      RAISE EXCEPTION 'Voucher % has no entries. Add debit and credit lines before posting.',
        NEW.voucher_number;
    END IF;

    IF round(v_dr, 2) <> round(v_cr, 2) THEN
      RAISE EXCEPTION 'Voucher % is unbalanced. Dr=% Cr=% Diff=%',
        NEW.voucher_number, v_dr, v_cr, abs(v_dr - v_cr);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════════
-- 1. LEDGER GROUPS
-- Chart of accounts hierarchy (Tally-compatible).
-- company_id = NULL → system group shared across all companies.
-- company_id = UUID → company-specific extension group.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.ledger_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES registry.companies(id),  -- NULL = system
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  parent_id     UUID REFERENCES pramaana.ledger_groups(id),
  nature        TEXT NOT NULL CHECK (nature IN ('ASSET','LIABILITY','INCOME','EXPENSE')),
  is_system     BOOLEAN DEFAULT FALSE,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
-- Partial unique indexes handle NULL company_id correctly (PG unique ignores NULLs)
CREATE UNIQUE INDEX idx_lgr_groups_sys_code  ON pramaana.ledger_groups(code)
  WHERE company_id IS NULL;
CREATE UNIQUE INDEX idx_lgr_groups_co_code   ON pramaana.ledger_groups(company_id, code)
  WHERE company_id IS NOT NULL;
CREATE INDEX idx_lgr_groups_parent           ON pramaana.ledger_groups(parent_id);
CREATE INDEX idx_lgr_groups_company          ON pramaana.ledger_groups(company_id);

-- ── System group seed (Tally-compatible; fixed UUIDs for idempotency) ──
INSERT INTO pramaana.ledger_groups
  (id, company_id, code, name, parent_id, nature, is_system, sort_order)
VALUES
  -- Top-level
  ('10000000-0000-0000-0000-000000000001',NULL,'ASSETS',       'Assets',                   NULL,                                  'ASSET',     TRUE,10),
  ('10000000-0000-0000-0000-000000000002',NULL,'LIABILITIES',  'Liabilities',              NULL,                                  'LIABILITY', TRUE,20),
  ('10000000-0000-0000-0000-000000000003',NULL,'INCOME',       'Income',                   NULL,                                  'INCOME',    TRUE,30),
  ('10000000-0000-0000-0000-000000000004',NULL,'EXPENDITURE',  'Expenditure',              NULL,                                  'EXPENSE',   TRUE,40),
  -- Asset sub-groups
  ('10000000-0000-0000-0000-000000000011',NULL,'FIXED_ASSETS', 'Fixed Assets',             '10000000-0000-0000-0000-000000000001','ASSET',     TRUE,11),
  ('10000000-0000-0000-0000-000000000012',NULL,'CURR_ASSETS',  'Current Assets',           '10000000-0000-0000-0000-000000000001','ASSET',     TRUE,12),
  ('10000000-0000-0000-0000-000000000013',NULL,'INVESTMENTS',  'Investments',              '10000000-0000-0000-0000-000000000001','ASSET',     TRUE,13),
  ('10000000-0000-0000-0000-000000000014',NULL,'CASH_IN_HAND', 'Cash in Hand',             '10000000-0000-0000-0000-000000000012','ASSET',     TRUE,14),
  ('10000000-0000-0000-0000-000000000015',NULL,'BANK_ACCTS',   'Bank Accounts',            '10000000-0000-0000-0000-000000000012','ASSET',     TRUE,15),
  ('10000000-0000-0000-0000-000000000016',NULL,'SUNDRY_DEB',   'Sundry Debtors',           '10000000-0000-0000-0000-000000000012','ASSET',     TRUE,16),
  ('10000000-0000-0000-0000-000000000017',NULL,'LOANS_GIVEN',  'Loans & Advances (Given)', '10000000-0000-0000-0000-000000000012','ASSET',     TRUE,17),
  ('10000000-0000-0000-0000-000000000018',NULL,'STOCK_HAND',   'Stock in Hand',            '10000000-0000-0000-0000-000000000012','ASSET',     TRUE,18),
  -- Liability sub-groups
  ('10000000-0000-0000-0000-000000000021',NULL,'CAPITAL',      'Capital Account',          '10000000-0000-0000-0000-000000000002','LIABILITY', TRUE,21),
  ('10000000-0000-0000-0000-000000000022',NULL,'RESERVES',     'Reserves & Surplus',       '10000000-0000-0000-0000-000000000002','LIABILITY', TRUE,22),
  ('10000000-0000-0000-0000-000000000023',NULL,'CURR_LIAB',    'Current Liabilities',      '10000000-0000-0000-0000-000000000002','LIABILITY', TRUE,23),
  ('10000000-0000-0000-0000-000000000024',NULL,'SUNDRY_CRED',  'Sundry Creditors',         '10000000-0000-0000-0000-000000000023','LIABILITY', TRUE,24),
  ('10000000-0000-0000-0000-000000000025',NULL,'DUTIES_TAXES', 'Duties & Taxes',           '10000000-0000-0000-0000-000000000023','LIABILITY', TRUE,25),
  ('10000000-0000-0000-0000-000000000026',NULL,'PROVISIONS',   'Provisions',               '10000000-0000-0000-0000-000000000023','LIABILITY', TRUE,26),
  ('10000000-0000-0000-0000-000000000027',NULL,'LOANS_LIAB',   'Loans (Liability)',        '10000000-0000-0000-0000-000000000002','LIABILITY', TRUE,27),
  ('10000000-0000-0000-0000-000000000028',NULL,'SUSPENSE_GRP', 'Suspense Account',         '10000000-0000-0000-0000-000000000002','LIABILITY', TRUE,28),
  -- Income sub-groups
  ('10000000-0000-0000-0000-000000000031',NULL,'SALES_ACCTS',  'Sales Accounts',           '10000000-0000-0000-0000-000000000003','INCOME',    TRUE,31),
  ('10000000-0000-0000-0000-000000000032',NULL,'OTHER_INCOME', 'Other Income',             '10000000-0000-0000-0000-000000000003','INCOME',    TRUE,32),
  -- Expenditure sub-groups
  ('10000000-0000-0000-0000-000000000041',NULL,'PURCH_ACCTS',  'Purchase Accounts',        '10000000-0000-0000-0000-000000000004','EXPENSE',   TRUE,41),
  ('10000000-0000-0000-0000-000000000042',NULL,'DIRECT_EXP',   'Direct Expenses',          '10000000-0000-0000-0000-000000000004','EXPENSE',   TRUE,42),
  ('10000000-0000-0000-0000-000000000043',NULL,'INDIRECT_EXP', 'Indirect Expenses',        '10000000-0000-0000-0000-000000000004','EXPENSE',   TRUE,43)
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- 2. LEDGERS
-- Individual accounts in the chart of accounts. Always per-company.
-- entity_id is a soft ref to registry.entities for debtor/creditor accounts.
-- pramaana_ledger_id in registry.entity_roles points here (app-layer only).
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.ledgers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES registry.companies(id),
  group_id            UUID NOT NULL REFERENCES pramaana.ledger_groups(id),
  code                TEXT,
  name                TEXT NOT NULL,
  -- Party link: populated for debtor/creditor/vendor/party ledgers
  entity_id           UUID,               -- soft ref to registry.entities; no DB FK (cross-schema)
  -- Opening balance
  opening_balance     NUMERIC(15,2) DEFAULT 0,
  opening_dr_cr       TEXT DEFAULT 'Dr' CHECK (opening_dr_cr IN ('Dr','Cr')),
  -- Tally sync
  tally_ledger_name   TEXT,               -- must match Tally Prime ledger name exactly
  -- GST / TDS
  gstin               TEXT,
  is_tds_applicable   BOOLEAN DEFAULT FALSE,
  tds_rate            NUMERIC(5,2),
  -- Meta
  is_system           BOOLEAN DEFAULT FALSE,
  is_active           BOOLEAN DEFAULT TRUE,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);
CREATE INDEX idx_ledgers_company   ON pramaana.ledgers(company_id);
CREATE INDEX idx_ledgers_group     ON pramaana.ledgers(group_id);
CREATE INDEX idx_ledgers_entity    ON pramaana.ledgers(entity_id) WHERE entity_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════════
-- 3. COST CENTRES
-- Operational divisions within a company.
-- CalciWorks Division is seeded under RHHF.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.cost_centres (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES registry.companies(id),
  parent_id     UUID REFERENCES pramaana.cost_centres(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  is_system     BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, code)
);
CREATE INDEX idx_cost_centres_company ON pramaana.cost_centres(company_id);
CREATE INDEX idx_cost_centres_parent  ON pramaana.cost_centres(parent_id);

-- ── Seed: CalciWorks Division under RHHF ─────────────────────────
INSERT INTO pramaana.cost_centres (company_id, code, name, description, is_system)
SELECT id, 'CW_DIV', 'CalciWorks Division',
  'Shell calcination and lime products division (RHHF). Not a separate legal entity.',
  TRUE
FROM registry.companies WHERE code = 'RHHF'
ON CONFLICT (company_id, code) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- 4. VOUCHER TYPES
-- System-level (no company_id). Standard Indian accounting types.
-- Prefixes are used by registry.next_fy_sequence().
-- New voucher types must be added via SQL migration, not via the app.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.voucher_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  prefix        TEXT NOT NULL,              -- used in sequence: RHHF/PYMT/2526/0001
  nature        TEXT NOT NULL CHECK (nature IN (
                  'payment','receipt','journal','contra','purchase','sales'
                )),
  affects_bank  BOOLEAN DEFAULT FALSE,      -- true for payment/receipt/contra
  is_system     BOOLEAN DEFAULT TRUE,
  is_active     BOOLEAN DEFAULT TRUE
);

INSERT INTO pramaana.voucher_types (code, name, prefix, nature, affects_bank) VALUES
  ('PYMT',  'Payment',  'PYMT',  'payment',  TRUE),
  ('RCPT',  'Receipt',  'RCPT',  'receipt',  TRUE),
  ('JNL',   'Journal',  'JNL',   'journal',  FALSE),
  ('CNTR',  'Contra',   'CNTR',  'contra',   TRUE),
  ('PURCH', 'Purchase', 'PURCH', 'purchase', FALSE),
  ('SALE',  'Sales',    'SALE',  'sales',    FALSE)
ON CONFLICT (code) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- 5. APPROVAL RULES
-- Defines which vouchers require approval and from whom.
-- voucher_type_id = NULL means rule applies to all voucher types.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.approval_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES registry.companies(id),
  voucher_type_id   UUID REFERENCES pramaana.voucher_types(id),  -- NULL = all types
  min_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  max_amount        NUMERIC(15,2),                               -- NULL = no upper limit
  required_role     TEXT NOT NULL CHECK (required_role IN (
                      'admin','accounts','super_admin'
                    )),
  sequence_order    INT DEFAULT 1,          -- for multi-level approval (level 1, level 2...)
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_approval_rules_company ON pramaana.approval_rules(company_id);


-- ════════════════════════════════════════════════════════════════
-- 6. APPROVAL ACTIONS
-- Audit trail of every approval decision on a voucher.
-- FK to pramaana.vouchers is added after vouchers table is created below.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.approval_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL,            -- FK added after pramaana.vouchers is created
  company_id      UUID NOT NULL REFERENCES registry.companies(id),
  rule_id         UUID REFERENCES pramaana.approval_rules(id),
  action          TEXT NOT NULL CHECK (action IN (
                    'submitted','approved','rejected','escalated','recalled'
                  )),
  actioned_by     UUID NOT NULL REFERENCES auth.users(id),
  comments        TEXT,
  actioned_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_approval_actions_voucher  ON pramaana.approval_actions(voucher_id);
CREATE INDEX idx_approval_actions_company  ON pramaana.approval_actions(company_id);
CREATE INDEX idx_approval_actions_actor    ON pramaana.approval_actions(actioned_by);


-- ════════════════════════════════════════════════════════════════
-- 7. VOUCHERS
-- Core accounting document. One row per voucher.
-- voucher_number is generated by registry.next_fy_sequence().
-- status lifecycle: draft → pending_approval → approved → posted
--                                                        → cancelled (from any pre-posted state)
-- Once posted: immutable (enforced by trigger fn_prevent_posted_edit).
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.vouchers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES registry.companies(id),
  voucher_type_id     UUID NOT NULL REFERENCES pramaana.voucher_types(id),
  voucher_number      TEXT NOT NULL,          -- RHHF/PYMT/2526/0001
  voucher_date        DATE NOT NULL,
  narration           TEXT,
  -- Primary party (payee / payer / counter-party)
  entity_id           UUID,                   -- soft ref to registry.entities
  -- Amount (denormalised from voucher_entries for quick display)
  amount              NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Payment instrument (populated for PYMT/RCPT/CNTR only)
  payment_mode        TEXT CHECK (payment_mode IN (
                        'cash','bank','upi','cheque','neft','rtgs','imps',NULL
                      )),
  bank_ledger_id      UUID,                   -- soft ref to pramaana.ledgers (bank/cash ledger)
  cheque_number       TEXT,
  cheque_date         DATE,
  utr_number          TEXT,                   -- UTR / transaction ref for NEFT/RTGS/UPI
  -- Cost centre (optional — for CalciWorks or other divisions)
  cost_centre_id      UUID REFERENCES pramaana.cost_centres(id),
  -- Document cross-reference (optional)
  ref_document_number TEXT,                   -- e.g. PO number, invoice number
  ref_document_type   TEXT,                   -- 'purchase_order','invoice','gst_invoice'
  -- Approval
  needs_approval      BOOLEAN DEFAULT FALSE,
  -- Status
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft','pending_approval','approved','posted','cancelled'
                        )),
  posted_at           TIMESTAMPTZ,
  posted_by           UUID REFERENCES auth.users(id),
  cancelled_at        TIMESTAMPTZ,
  cancelled_by        UUID REFERENCES auth.users(id),
  cancellation_reason TEXT,
  -- Meta
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, voucher_number)
);
CREATE INDEX idx_vouchers_company  ON pramaana.vouchers(company_id);
CREATE INDEX idx_vouchers_date     ON pramaana.vouchers(voucher_date);
CREATE INDEX idx_vouchers_status   ON pramaana.vouchers(status);
CREATE INDEX idx_vouchers_entity   ON pramaana.vouchers(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_vouchers_type     ON pramaana.vouchers(voucher_type_id);

-- Back-fill FK from approval_actions.voucher_id now that vouchers exists
ALTER TABLE pramaana.approval_actions
  ADD CONSTRAINT fk_approval_actions_voucher
  FOREIGN KEY (voucher_id) REFERENCES pramaana.vouchers(id) ON DELETE CASCADE;


-- ════════════════════════════════════════════════════════════════
-- 8. VOUCHER ENTRIES
-- Double-entry ledger lines. Each voucher must balance: Σ Dr = Σ Cr.
-- Validated by trigger fn_validate_voucher_balance() on posting.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.voucher_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL REFERENCES pramaana.vouchers(id) ON DELETE CASCADE,
  ledger_id       UUID NOT NULL REFERENCES pramaana.ledgers(id),
  cost_centre_id  UUID REFERENCES pramaana.cost_centres(id),
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('Dr','Cr')),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  narration       TEXT,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ventry_voucher ON pramaana.voucher_entries(voucher_id);
CREATE INDEX idx_ventry_ledger  ON pramaana.voucher_entries(ledger_id);


-- ════════════════════════════════════════════════════════════════
-- 9. VOUCHER LINE ITEMS
-- Detailed bill breakdown (goods/services). Optional — used for
-- purchase bills, expense claims, and sales invoices.
-- These are separate from accounting entries (section 8).
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.voucher_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL REFERENCES pramaana.vouchers(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  hsn_sac         TEXT,
  quantity        NUMERIC(15,3),
  unit            TEXT,
  rate            NUMERIC(15,4),
  amount          NUMERIC(15,2) NOT NULL,
  gst_rate        NUMERIC(5,2) DEFAULT 0,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_vline_voucher ON pramaana.voucher_line_items(voucher_id);


-- ════════════════════════════════════════════════════════════════
-- 10. SUSPENSE SETTLEMENTS
-- Tracks advance payments (suspense) and their clearance.
-- Each row records one advance linked to one clearing voucher.
-- status: open = advance unclaimed; partial = partially settled; cleared = fully settled.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.suspense_settlements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES registry.companies(id),
  entity_id             UUID,               -- soft ref to registry.entities (the advance recipient)
  advance_voucher_id    UUID NOT NULL REFERENCES pramaana.vouchers(id),
  settlement_voucher_id UUID REFERENCES pramaana.vouchers(id),    -- NULL until settled
  advance_amount        NUMERIC(15,2) NOT NULL,
  settled_amount        NUMERIC(15,2) DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','partial','cleared')),
  settled_at            TIMESTAMPTZ,
  settled_by            UUID REFERENCES auth.users(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_suspense_company  ON pramaana.suspense_settlements(company_id);
CREATE INDEX idx_suspense_entity   ON pramaana.suspense_settlements(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_suspense_status   ON pramaana.suspense_settlements(status);


-- ════════════════════════════════════════════════════════════════
-- 11. VOUCHER ATTACHMENTS
-- File attachments linked to a voucher (bills, receipts, approvals).
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.voucher_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL REFERENCES pramaana.vouchers(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES registry.companies(id),
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  mime_type       TEXT,
  file_size_bytes INT,
  uploaded_by     UUID REFERENCES auth.users(id),
  uploaded_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_vattach_voucher ON pramaana.voucher_attachments(voucher_id);


-- ════════════════════════════════════════════════════════════════
-- 12. CAPTURE SESSIONS
-- Mobile bill capture: field staff photograph a bill, system
-- extracts data, accountant reviews and creates the voucher.
-- Expires after 24 hours if not submitted.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.capture_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES registry.companies(id),
  created_by          UUID NOT NULL REFERENCES auth.users(id),
  device_info         TEXT,
  images              JSONB DEFAULT '[]',       -- [{url, uploaded_at, mime_type}]
  raw_ocr_data        JSONB,                    -- extracted text (if OCR applied)
  suggested_vendor    TEXT,
  suggested_amount    NUMERIC(15,2),
  linked_voucher_id   UUID REFERENCES pramaana.vouchers(id),
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','submitted','expired','cancelled')),
  expires_at          TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours',
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_capture_company ON pramaana.capture_sessions(company_id);
CREATE INDEX idx_capture_creator ON pramaana.capture_sessions(created_by);
CREATE INDEX idx_capture_status  ON pramaana.capture_sessions(status);


-- ════════════════════════════════════════════════════════════════
-- 13. NOTIFICATIONS
-- In-app notifications for approval requests, decisions, reminders.
-- Scoped to a recipient user — RLS filters by user_id.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES registry.companies(id),
  type            TEXT NOT NULL CHECK (type IN (
                    'approval_required','approved','rejected','posted',
                    'reminder','comment','system'
                  )),
  title           TEXT NOT NULL,
  message         TEXT,
  voucher_id      UUID,                     -- soft ref to pramaana.vouchers
  action_url      TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_notif_recipient ON pramaana.notifications(recipient_id);
CREATE INDEX idx_notif_read      ON pramaana.notifications(recipient_id, read_at) WHERE read_at IS NULL;


-- ════════════════════════════════════════════════════════════════
-- 14. PUSH SUBSCRIPTIONS
-- Web Push API subscriptions (one per browser/device per user).
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,                -- client public key
  auth_key    TEXT NOT NULL,                -- auth secret
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
CREATE INDEX idx_push_user ON pramaana.push_subscriptions(user_id);


-- ════════════════════════════════════════════════════════════════
-- 15. OTP SESSIONS
-- OTP authorisation for high-value payments.
-- otp_hash: store bcrypt hash of OTP — NEVER store the plain OTP.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.otp_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL REFERENCES pramaana.vouchers(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES registry.companies(id),
  initiated_by    UUID NOT NULL REFERENCES auth.users(id),
  mobile          TEXT NOT NULL,            -- number OTP was sent to
  otp_hash        TEXT NOT NULL,            -- bcrypt hash; plain OTP is never stored
  expires_at      TIMESTAMPTZ NOT NULL,
  verified_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','verified','expired','cancelled')),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_otp_voucher  ON pramaana.otp_sessions(voucher_id);
CREATE INDEX idx_otp_status   ON pramaana.otp_sessions(status);


-- ════════════════════════════════════════════════════════════════
-- 16. SETTLEMENT SESSIONS
-- Orchestrates batch clearance of multiple advances for one entity.
-- Groups related suspense_settlements into a single settlement event.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.settlement_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES registry.companies(id),
  entity_id             UUID,               -- soft ref to registry.entities
  initiated_by          UUID NOT NULL REFERENCES auth.users(id),
  total_advance_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_settled_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','in_progress','completed','cancelled')),
  completed_at          TIMESTAMPTZ,
  completed_by          UUID REFERENCES auth.users(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_settlement_company ON pramaana.settlement_sessions(company_id);
CREATE INDEX idx_settlement_entity  ON pramaana.settlement_sessions(entity_id) WHERE entity_id IS NOT NULL;

-- Link individual suspense settlements to a session
ALTER TABLE pramaana.suspense_settlements
  ADD COLUMN settlement_session_id UUID REFERENCES pramaana.settlement_sessions(id);


-- ════════════════════════════════════════════════════════════════
-- 17. GST DETAILS
-- GST breakdown per voucher. One row per GST-applicable transaction.
-- Linked to a voucher; optionally linked to a voucher_line_item.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.gst_details (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id          UUID NOT NULL REFERENCES pramaana.vouchers(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES registry.companies(id),
  line_item_id        UUID REFERENCES pramaana.voucher_line_items(id),
  gstin_party         TEXT,
  place_of_supply     TEXT,
  supply_type         TEXT CHECK (supply_type IN ('intra','inter')),
  hsn_sac             TEXT,
  taxable_amount      NUMERIC(15,2) NOT NULL,
  cgst_rate           NUMERIC(5,2) DEFAULT 0,
  cgst_amount         NUMERIC(15,2) DEFAULT 0,
  sgst_rate           NUMERIC(5,2) DEFAULT 0,
  sgst_amount         NUMERIC(15,2) DEFAULT 0,
  igst_rate           NUMERIC(5,2) DEFAULT 0,
  igst_amount         NUMERIC(15,2) DEFAULT 0,
  cess_rate           NUMERIC(5,2) DEFAULT 0,
  cess_amount         NUMERIC(15,2) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_gst_voucher  ON pramaana.gst_details(voucher_id);
CREATE INDEX idx_gst_company  ON pramaana.gst_details(company_id);


-- ════════════════════════════════════════════════════════════════
-- 18. PERIOD LOCKS
-- Prevents voucher posting to locked accounting periods.
-- month = NULL means the entire financial year is locked.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.period_locks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES registry.companies(id),
  fy_year         INT NOT NULL,             -- FY start year e.g. 2025 for FY 2025-26
  month           INT CHECK (month BETWEEN 1 AND 12),  -- NULL = entire FY
  locked_at       TIMESTAMPTZ DEFAULT now(),
  locked_by       UUID REFERENCES auth.users(id),
  unlocked_at     TIMESTAMPTZ,
  unlocked_by     UUID REFERENCES auth.users(id),
  reason          TEXT,
  UNIQUE(company_id, fy_year, month)
);
CREATE INDEX idx_period_locks_company ON pramaana.period_locks(company_id);


-- ════════════════════════════════════════════════════════════════
-- 19. AUDIT LOG
-- Append-only. Matches structure of registry.audit_log.
-- No UPDATE or DELETE on this table — enforced by policy (no UPDATE/DELETE grant).
-- fn_audit_voucher() is defined immediately after this table so it can
-- reference pramaana.audit_log at creation time.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE pramaana.audit_log (
  id              BIGSERIAL PRIMARY KEY,
  company_id      UUID,
  schema_name     TEXT NOT NULL,
  table_name      TEXT NOT NULL,
  record_id       UUID,
  action          TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data        JSONB,
  new_data        JSONB,
  changed_fields  TEXT[],
  user_id         UUID,
  user_email      TEXT,
  app             TEXT DEFAULT 'pramaana',
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_pramaana_audit_company ON pramaana.audit_log(company_id);
CREATE INDEX idx_pramaana_audit_table   ON pramaana.audit_log(table_name);
CREATE INDEX idx_pramaana_audit_created ON pramaana.audit_log(created_at);

-- ── 4. Audit trigger function (defined here — requires pramaana.audit_log) ──
CREATE OR REPLACE FUNCTION pramaana.fn_audit_voucher()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO pramaana.audit_log
      (company_id, schema_name, table_name, record_id, action, old_data, user_id)
    VALUES (OLD.company_id, 'pramaana', TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO pramaana.audit_log
      (company_id, schema_name, table_name, record_id, action, new_data, user_id)
    VALUES (NEW.company_id, 'pramaana', TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSE
    INSERT INTO pramaana.audit_log
      (company_id, schema_name, table_name, record_id, action, old_data, new_data, user_id)
    VALUES (NEW.company_id, 'pramaana', TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — enable on all tables
-- ════════════════════════════════════════════════════════════════
ALTER TABLE pramaana.ledger_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.ledgers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.cost_centres         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.voucher_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.approval_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.approval_actions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.vouchers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.voucher_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.voucher_line_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.suspense_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.voucher_attachments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.capture_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.push_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.otp_sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.settlement_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.gst_details          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.period_locks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pramaana.audit_log            ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- Pattern: registry.has_company_access(company_id) for company-scoped tables.
--          Role restrictions (accounts/admin/auditor) are enforced at app layer.
-- ════════════════════════════════════════════════════════════════

-- ledger_groups: system groups (company_id IS NULL) readable by all authenticated users
CREATE POLICY lgr_groups_access ON pramaana.ledger_groups
  FOR ALL USING (
    company_id IS NULL
    OR registry.has_company_access(company_id)
  )
  WITH CHECK (
    (company_id IS NULL AND registry.is_super_admin())
    OR (company_id IS NOT NULL AND registry.has_company_access(company_id))
  );

-- voucher_types: system table — all authenticated users can read; only super_admin writes
CREATE POLICY vtype_read ON pramaana.voucher_types
  FOR SELECT USING (TRUE);
CREATE POLICY vtype_write ON pramaana.voucher_types
  FOR ALL USING (registry.is_super_admin())
  WITH CHECK (registry.is_super_admin());

-- Standard company isolation — applied to all remaining company-scoped tables
CREATE POLICY company_isolation ON pramaana.ledgers
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.cost_centres
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.approval_rules
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.approval_actions
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.vouchers
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY via_voucher ON pramaana.voucher_entries
  FOR ALL USING (
    voucher_id IN (
      SELECT id FROM pramaana.vouchers WHERE registry.has_company_access(company_id)
    )
  )
  WITH CHECK (
    voucher_id IN (
      SELECT id FROM pramaana.vouchers WHERE registry.has_company_access(company_id)
    )
  );

CREATE POLICY via_voucher ON pramaana.voucher_line_items
  FOR ALL USING (
    voucher_id IN (
      SELECT id FROM pramaana.vouchers WHERE registry.has_company_access(company_id)
    )
  )
  WITH CHECK (
    voucher_id IN (
      SELECT id FROM pramaana.vouchers WHERE registry.has_company_access(company_id)
    )
  );

CREATE POLICY company_isolation ON pramaana.suspense_settlements
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.voucher_attachments
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.capture_sessions
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

-- notifications: each user sees only their own
CREATE POLICY own_notifications ON pramaana.notifications
  FOR ALL USING (recipient_id = auth.uid() OR registry.is_super_admin())
  WITH CHECK (recipient_id = auth.uid() OR registry.is_super_admin());

-- push_subscriptions: each user manages only their own
CREATE POLICY own_push ON pramaana.push_subscriptions
  FOR ALL USING (user_id = auth.uid() OR registry.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR registry.is_super_admin());

CREATE POLICY company_isolation ON pramaana.otp_sessions
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.settlement_sessions
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.gst_details
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

CREATE POLICY company_isolation ON pramaana.period_locks
  FOR ALL USING (registry.has_company_access(company_id))
  WITH CHECK (registry.has_company_access(company_id));

-- audit_log: read only; no UPDATE or DELETE granted (see grants below)
CREATE POLICY audit_log_read ON pramaana.audit_log
  FOR SELECT USING (
    company_id IS NULL
    OR registry.has_company_access(company_id)
  );
CREATE POLICY audit_log_insert ON pramaana.audit_log
  FOR INSERT WITH CHECK (TRUE);             -- written by SECURITY DEFINER trigger only


-- ════════════════════════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.ledger_groups        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.ledgers              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.cost_centres         TO authenticated;
-- voucher_types: SELECT only for authenticated users.
-- New voucher types must be added via SQL migration only, not via the app.
GRANT SELECT                         ON pramaana.voucher_types        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.approval_rules       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.approval_actions     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.vouchers             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.voucher_entries      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.voucher_line_items   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.suspense_settlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.voucher_attachments  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.capture_sessions     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.notifications        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.push_subscriptions   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.otp_sessions         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.settlement_sessions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.gst_details          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pramaana.period_locks         TO authenticated;
-- audit_log: SELECT + INSERT only. No UPDATE or DELETE — ever.
GRANT SELECT, INSERT                 ON pramaana.audit_log            TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE pramaana.audit_log_id_seq            TO authenticated;
GRANT EXECUTE ON FUNCTION pramaana.set_updated_at                     TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- TRIGGERS (4)
-- ════════════════════════════════════════════════════════════════

-- ── 1. set_updated_at on all mutable tables ───────────────────────
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON pramaana.ledger_groups
  FOR EACH ROW EXECUTE FUNCTION pramaana.set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON pramaana.ledgers
  FOR EACH ROW EXECUTE FUNCTION pramaana.set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON pramaana.cost_centres
  FOR EACH ROW EXECUTE FUNCTION pramaana.set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON pramaana.vouchers
  FOR EACH ROW EXECUTE FUNCTION pramaana.set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON pramaana.suspense_settlements
  FOR EACH ROW EXECUTE FUNCTION pramaana.set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON pramaana.settlement_sessions
  FOR EACH ROW EXECUTE FUNCTION pramaana.set_updated_at();

-- ── 2. Audit log on voucher INSERT / UPDATE / DELETE ─────────────
CREATE TRIGGER trg_audit_vouchers
  AFTER INSERT OR UPDATE OR DELETE ON pramaana.vouchers
  FOR EACH ROW EXECUTE FUNCTION pramaana.fn_audit_voucher();

-- ── 3. Prevent editing posted or cancelled vouchers ───────────────
CREATE TRIGGER trg_prevent_posted_edit
  BEFORE UPDATE OR DELETE ON pramaana.vouchers
  FOR EACH ROW EXECUTE FUNCTION pramaana.fn_prevent_posted_edit();

-- ── 4. Validate Dr = Cr when transitioning to 'posted' ───────────
CREATE TRIGGER trg_validate_voucher_balance
  BEFORE UPDATE ON pramaana.vouchers
  FOR EACH ROW EXECUTE FUNCTION pramaana.fn_validate_voucher_balance();
