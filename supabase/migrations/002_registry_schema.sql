-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Registry Schema DDL
-- Migration: 002_registry_schema.sql
-- Source: RELISH_SUITE_SPEC_V2.md Section 3
-- Prerequisite: 001_create_schemas.sql (schemas + vector extension)
-- RLS policies: NOT included here — see 005_rls_and_grants.sql
-- ════════════════════════════════════════════════════════════════

-- Safety: uuid-ossp is already enabled (existing schema uses uuid_generate_v4).
-- gen_random_uuid() is built-in for PG13+ — no extension needed for new tables.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ════════════════════════════════════════════════════════════════
-- COMPANIES
-- Two legal entities only: RHHF and RFPL.
-- CalciWorks is NOT a company record — it is a Pramaana cost centre under RHHF.
-- legacy_id stores the old text PK ('rhhf', 'rfpl') — critical for migration.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,         -- 'RHHF', 'RFPL'
  name                TEXT NOT NULL,
  legal_name          TEXT,
  short_name          TEXT,
  entity_type         TEXT NOT NULL CHECK (entity_type IN (
                        'Proprietorship','Partnership','LLP','Private Limited'
                      )),
  gstin               TEXT,
  pan                 TEXT,
  cin                 TEXT,                         -- RFPL only
  tan                 TEXT,
  address_line1       TEXT,
  address_line2       TEXT,
  city                TEXT,
  state               TEXT,
  state_code          TEXT,                         -- '32' Kerala, '33' Tamil Nadu
  pincode             TEXT,
  country             TEXT DEFAULT 'India',
  phone               TEXT,
  email               TEXT,
  logo_url            TEXT,
  po_prefix           TEXT,
  invoice_prefix      TEXT,
  fy_start_month      INT DEFAULT 4,                -- April
  tally_company_name  TEXT,                         -- must match exactly in Tally Prime
  legacy_id           TEXT,                         -- old text PK from public.companies
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Seed: two companies only
INSERT INTO registry.companies
  (code, name, legal_name, short_name, entity_type,
   gstin, state, state_code, fy_start_month,
   address_line1, city, pincode, country,
   tally_company_name, legacy_id)
VALUES
  ('RHHF',
   'Relish Hao Hao Chi Foods',
   'Relish Hao Hao Chi Foods',
   'RHHF',
   'Partnership',
   '32AAUFR0742E1ZB',
   'Kerala', '32', 4,
   '26/599, M.O.Ward', 'Alappuzha', '688001', 'India',
   'Relish Hao Hao Chi Foods',
   'rhhf'),
  ('RFPL',
   'Relish Foods Pvt Ltd',
   'Relish Foods Private Limited',
   'RFPL',
   'Private Limited',
   '33AAACR7749E2ZD',
   'Tamil Nadu', '33', 4,
   '179 B, Madhavapuram', 'Kanyakumari', '629704', 'India',
   'Relish Foods Private Limited',
   'rfpl');

-- ════════════════════════════════════════════════════════════════
-- PROFILES
-- One row per authenticated Supabase user. Links to auth.users.
-- No global role column — role is per company in company_users.
-- entity_id FK is added after the entities table is created below.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  email               TEXT,
  mobile              TEXT UNIQUE,
  mobile_verified     BOOLEAN DEFAULT FALSE,
  is_super_admin      BOOLEAN DEFAULT FALSE,  -- platform-level; overrides all company roles
  is_active           BOOLEAN DEFAULT TRUE,
  entity_id           UUID,                   -- soft ref to registry.entities; FK added below
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  last_login          TIMESTAMPTZ
);

-- ════════════════════════════════════════════════════════════════
-- COMPANY ACCESS & ROLES
-- Per-company role assignment. One role per user per company.
-- 'super_admin' is NOT a valid role here — use profiles.is_super_admin.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.company_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES registry.companies(id),
  role                TEXT NOT NULL CHECK (role IN (
                        'admin',        -- full company access; post; approve
                        'accounts',     -- entry and review; no posting
                        'auditor',      -- read-only; reports; tally export
                        'hr',           -- onboarding and HR; no accounting
                        'operations',   -- ClamFlow plant ops; no accounting
                        'viewer'        -- dashboard only
                      )),
  is_primary          BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, company_id)           -- one role per user per company
);

-- ════════════════════════════════════════════════════════════════
-- APP ACCESS
-- Controls which apps a user can enter.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.app_access (
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  app                 TEXT NOT NULL CHECK (app IN ('suite','pramaana','clamflow')),
  can_access          BOOLEAN DEFAULT TRUE,
  granted_by          UUID REFERENCES auth.users(id),
  granted_at          TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, app)
);

-- ════════════════════════════════════════════════════════════════
-- ENTITIES
-- Every person and organisation the Relish Group interacts with.
-- One record. Referenced everywhere by entity_id.
-- pan appears ONCE as a shared field — applies to both persons and organisations.
-- COMPLIANCE: Aadhaar 12-digit number is NEVER stored. Store last4 + token only.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.entities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                TEXT NOT NULL CHECK (type IN ('PERSON','ORGANISATION')),
  display_name        TEXT NOT NULL,
  alias               TEXT,

  -- ── SHARED FIELDS (persons and organisations) ────────────────
  pan                 TEXT,               -- Income Tax PAN (all entity types)
  pan_verified        BOOLEAN DEFAULT FALSE,
  mobile              TEXT,
  mobile_alt          TEXT,
  email               TEXT,
  address_line1       TEXT,
  address_line2       TEXT,
  city                TEXT,
  state               TEXT,
  pincode             TEXT,
  country             TEXT DEFAULT 'India',

  -- ── ORGANISATION-SPECIFIC ────────────────────────────────────
  legal_name          TEXT,
  gstin               TEXT,
  gstin_verified      BOOLEAN DEFAULT FALSE,
  gstin_verified_at   TIMESTAMPTZ,
  cin                 TEXT,
  organisation_type   TEXT,               -- 'Proprietorship','Fisher','Boat Owner' etc.
  boat_registration   TEXT,               -- for fishing vessel operators

  -- ── PERSON-SPECIFIC ──────────────────────────────────────────
  first_name          TEXT,
  last_name           TEXT,
  date_of_birth       DATE,
  gender              TEXT CHECK (gender IN ('Male','Female','Other','Unspecified')),
  -- Aadhaar: NEVER store the 12-digit number. Aadhaar Act + DPDP Act 2023.
  aadhaar_last4       TEXT,               -- last 4 digits for display only
  aadhaar_verified    BOOLEAN DEFAULT FALSE,
  aadhaar_verified_at TIMESTAMPTZ,
  aadhaar_ref_token   TEXT,               -- Surepass/provider session token; NOT the number

  -- ── PAYMENT CAPABILITY (all entities except Customers) ───────
  bank_name           TEXT,
  bank_account_holder TEXT,
  bank_account_number TEXT,               -- encrypt at application layer
  bank_ifsc           TEXT,
  upi_id              TEXT,
  payment_verified    BOOLEAN DEFAULT FALSE,
  suspense_eligible   BOOLEAN DEFAULT FALSE,  -- eligible for advance payments (staff)

  -- ── REGISTRY METADATA ────────────────────────────────────────
  requires_otp        BOOLEAN DEFAULT TRUE,
  payee_type          TEXT DEFAULT 'registered'
                        CHECK (payee_type IN ('registered','adhoc')),
  is_global           BOOLEAN DEFAULT FALSE,
  source_app          TEXT DEFAULT 'suite',

  -- ── LEGACY MIGRATION REFERENCES ──────────────────────────────
  legacy_clamflow_person_id   UUID,
  legacy_clamflow_supplier_id UUID,
  legacy_approvals_payee_id   UUID,
  legacy_approvals_user_id    UUID,
  legacy_suite_vendor_id      UUID,       -- public.vendors.id
  legacy_suite_buyer_id       UUID,       -- public.buyers.id

  is_active           BOOLEAN DEFAULT TRUE,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entities_type    ON registry.entities(type);
CREATE INDEX idx_entities_gstin   ON registry.entities(gstin) WHERE gstin IS NOT NULL;
CREATE INDEX idx_entities_pan     ON registry.entities(pan) WHERE pan IS NOT NULL;
CREATE INDEX idx_entities_mobile  ON registry.entities(mobile) WHERE mobile IS NOT NULL;
CREATE INDEX idx_entities_display ON registry.entities(display_name);

-- Add soft-ref FK from profiles to entities
-- DEFERRABLE so both tables can be populated before enforcement
ALTER TABLE registry.profiles
  ADD CONSTRAINT profiles_entity_soft_ref
  FOREIGN KEY (entity_id) REFERENCES registry.entities(id)
  DEFERRABLE INITIALLY DEFERRED;

-- ════════════════════════════════════════════════════════════════
-- ENTITY ROLES
-- What role an entity plays within a specific company.
-- pramaana_ledger_id: intentional soft reference — NOT a DB FK.
-- Cross-schema FK to pramaana.ledgers is validated at application layer only.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.entity_roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES registry.entities(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES registry.companies(id),
  role                TEXT NOT NULL CHECK (role IN (
                        'Management',   -- Director, Partner — also payee
                        'Staff',        -- Employee, worker — also payee
                        'Vendor',       -- Goods/services supplier — also payee
                        'Supplier',     -- Raw material (clams, coir) — also payee
                        'Customer',     -- Buyer — NOT a payee
                        'Auditor',      -- External auditor — also payee
                        'Government',   -- Tax authorities — also payee
                        'Fisher',       -- Fishing vessel operator — also payee
                        'Contractor'    -- Project contractor — also payee
                      )),
  employee_id         TEXT,
  staff_id_code       TEXT,
  department          TEXT,
  designation         TEXT,
  date_joined         DATE,
  date_left           DATE,
  credit_limit        NUMERIC(15,2),
  credit_days         INT,
  tally_ledger        TEXT,
  -- Soft reference to pramaana.ledgers.id — NOT enforced by DB constraint
  pramaana_ledger_id  UUID,
  station             TEXT,
  supplier_type       TEXT,
  category            TEXT,
  notes               TEXT,
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_id, company_id, role)
);

CREATE INDEX idx_entity_roles_entity  ON registry.entity_roles(entity_id);
CREATE INDEX idx_entity_roles_company ON registry.entity_roles(company_id);
CREATE INDEX idx_entity_roles_role    ON registry.entity_roles(role);

-- ════════════════════════════════════════════════════════════════
-- BIOMETRICS
-- Central biometric store — ALL staff, ALL locations.
-- face_embedding requires the vector extension (enabled in 001_create_schemas.sql).
-- Readable ONLY by: hr, operations, is_super_admin (RLS in 005_rls_and_grants.sql).
-- Pramaana and Suite dashboard CANNOT read this table.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.biometrics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL UNIQUE REFERENCES registry.entities(id) ON DELETE CASCADE,
  face_image_url        TEXT,
  face_embedding        vector(512),                -- pgvector local matching
  rekognition_face_id   TEXT,                       -- AWS Rekognition face ID
  rekognition_collection TEXT DEFAULT 'relish-staff', -- 'relish-staff' or 'relish-visitors'
  face_enrolled_at      TIMESTAMPTZ,
  face_enrolled_by      UUID REFERENCES auth.users(id),
  authorized_locations  TEXT[] DEFAULT '{}',
  -- Valid values: 'panavally_plant','main_office','rfpl_plant','cold_storage'
  is_enrolled           BOOLEAN DEFAULT FALSE,
  enrollment_status     TEXT DEFAULT 'pending'
                          CHECK (enrollment_status IN (
                            'pending','enrolled','failed','suspended'
                          )),
  legacy_rekognition_id TEXT,                       -- old clamflow-staff collection face ID
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════
-- ATTENDANCE
-- Group-wide attendance. Multi-site. All methods.
-- Replaces ClamFlow attendance_logs (was plant-only).
-- shift_assignment_id: intentional soft reference — NOT a DB FK.
-- Cross-schema reference to clamflow.shift_assignments validated at app layer.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.attendance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES registry.entities(id),
  company_id          UUID NOT NULL REFERENCES registry.companies(id),
  event_type          TEXT NOT NULL CHECK (event_type IN ('check_in','check_out')),
  method              TEXT NOT NULL CHECK (method IN (
                        'face_recognition','manual','otp','rfid','qr_code'
                      )),
  location            TEXT NOT NULL,
  -- Valid values: 'panavally_plant','main_office','rfpl_plant','cold_storage'
  timestamp           TIMESTAMPTZ DEFAULT now(),
  -- Soft reference to clamflow.shift_assignments.id — NOT a DB FK
  shift_assignment_id UUID,
  verified_by         UUID REFERENCES auth.users(id),
  override_reason     TEXT,
  confidence_score    FLOAT,
  photo_url           TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_attendance_entity    ON registry.attendance(entity_id);
CREATE INDEX idx_attendance_company   ON registry.attendance(company_id);
CREATE INDEX idx_attendance_timestamp ON registry.attendance(timestamp);
CREATE INDEX idx_attendance_location  ON registry.attendance(location);

-- ════════════════════════════════════════════════════════════════
-- ONBOARDING QUEUE
-- Structured onboarding. Replaces ClamFlow's JSONB blob onboarding_pending.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.onboarding_queue (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type                     TEXT NOT NULL CHECK (entity_type IN ('PERSON','ORGANISATION')),
  intended_role                   TEXT NOT NULL CHECK (intended_role IN (
                                    'Management','Staff','Vendor','Supplier',
                                    'Customer','Auditor','Government','Fisher','Contractor'
                                  )),
  company_id                      UUID NOT NULL REFERENCES registry.companies(id),
  display_name                    TEXT NOT NULL,
  mobile                          TEXT,
  email                           TEXT,
  gstin                           TEXT,
  pan                             TEXT,
  aadhaar_verification_initiated  BOOLEAN DEFAULT FALSE,
  aadhaar_verified                BOOLEAN DEFAULT FALSE,
  documents                       JSONB DEFAULT '[]',   -- [{type, url, verified}]
  checklist                       JSONB DEFAULT '[]',   -- [{item, completed, completed_by}]
  status                          TEXT NOT NULL DEFAULT 'draft'
                                    CHECK (status IN (
                                      'draft','pending_review','approved','rejected','on_hold'
                                    )),
  entity_id                       UUID REFERENCES registry.entities(id),  -- set on approval
  submitted_by                    UUID REFERENCES auth.users(id),
  submitted_at                    TIMESTAMPTZ,
  reviewed_by                     UUID REFERENCES auth.users(id),
  reviewed_at                     TIMESTAMPTZ,
  rejection_reason                TEXT,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ DEFAULT now(),
  updated_at                      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_onboarding_company ON registry.onboarding_queue(company_id);
CREATE INDEX idx_onboarding_status  ON registry.onboarding_queue(status);

-- ════════════════════════════════════════════════════════════════
-- VISITORS
-- Short-lived entities. Registry owns visitor records.
-- ClamFlow owns the entry session (clamflow.visitor_sessions).
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.visitors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID REFERENCES registry.entities(id), -- pre-registered visitors
  name                TEXT NOT NULL,
  phone               TEXT,
  purpose             TEXT,
  company_visiting    TEXT,
  host_entity_id      UUID REFERENCES registry.entities(id),
  company_id          UUID REFERENCES registry.companies(id),
  location            TEXT,
  photo_url           TEXT,
  rekognition_face_id TEXT,                         -- in 'relish-visitors' collection
  pass_token          TEXT UNIQUE,
  valid_from          TIMESTAMPTZ DEFAULT now(),
  valid_until         TIMESTAMPTZ,
  status              TEXT DEFAULT 'active'
                        CHECK (status IN ('active','expired','revoked')),
  registered_by       UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE registry.visitor_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id          UUID NOT NULL REFERENCES registry.visitors(id),
  event_type          TEXT NOT NULL CHECK (event_type IN (
                        'pass_issued','entry','exit',
                        'verification_failed','revoked','pass_scanned'
                      )),
  location            TEXT,
  captured_photo_url  TEXT,
  matched             BOOLEAN,
  confidence          FLOAT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════
-- SEQUENCE COUNTERS
-- Used by ALL apps for document numbering. No app invents its own.
--
-- Two helper functions:
--   next_fy_sequence  → financial year format: RHHF/PYMT/2526/0001 (Pramaana)
--   next_cal_sequence → calendar year format:  RHHF/PO/2025/0042   (Suite)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.sequence_counters (
  id            TEXT PRIMARY KEY,        -- '{company_code}_{prefix}_{year}'
  company_id    UUID NOT NULL REFERENCES registry.companies(id),
  prefix        TEXT NOT NULL,
  year          INT NOT NULL,            -- calendar year (2025, 2026...)
  last_number   INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Financial year sequence — for Pramaana (all voucher types)
-- Example: SELECT registry.next_fy_sequence(company_id, 'RHHF', 'PYMT')
-- Returns: 'RHHF/PYMT/2526/0001'
CREATE OR REPLACE FUNCTION registry.next_fy_sequence(
  p_company_id    UUID,
  p_company_code  TEXT,
  p_prefix        TEXT,
  p_fy_month      INT DEFAULT 4         -- month FY starts (April = 4)
) RETURNS TEXT AS $$
DECLARE
  v_now         DATE := CURRENT_DATE;
  v_year        INT;
  v_fy_short    TEXT;
  v_counter_id  TEXT;
  v_next        INT;
BEGIN
  -- Determine FY start year
  v_year := CASE
    WHEN EXTRACT(MONTH FROM v_now) >= p_fy_month
    THEN EXTRACT(YEAR FROM v_now)::INT
    ELSE EXTRACT(YEAR FROM v_now)::INT - 1
  END;
  -- FY short code: '2526' for FY starting April 2025
  v_fy_short := LPAD((v_year % 100)::TEXT, 2, '0') ||
                LPAD(((v_year + 1) % 100)::TEXT, 2, '0');
  v_counter_id := p_company_code || '_' || p_prefix || '_' || v_fy_short;

  INSERT INTO registry.sequence_counters (id, company_id, prefix, year, last_number)
  VALUES (v_counter_id, p_company_id, p_prefix, v_year, 1)
  ON CONFLICT (id)
  DO UPDATE SET
    last_number = registry.sequence_counters.last_number + 1,
    updated_at  = now()
  RETURNING last_number INTO v_next;

  RETURN p_company_code || '/' || p_prefix || '/' || v_fy_short || '/'
         || LPAD(v_next::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Calendar year sequence — for Suite (purchase orders, invoices)
-- Example: SELECT registry.next_cal_sequence(company_id, 'RHHF', 'PO')
-- Returns: 'RHHF/PO/2025/0042'
CREATE OR REPLACE FUNCTION registry.next_cal_sequence(
  p_company_id    UUID,
  p_company_code  TEXT,
  p_prefix        TEXT,
  p_year          INT DEFAULT EXTRACT(YEAR FROM now())::INT
) RETURNS TEXT AS $$
DECLARE
  v_counter_id  TEXT;
  v_next        INT;
BEGIN
  v_counter_id := p_company_code || '_' || p_prefix || '_' || p_year;

  INSERT INTO registry.sequence_counters (id, company_id, prefix, year, last_number)
  VALUES (v_counter_id, p_company_id, p_prefix, p_year, 1)
  ON CONFLICT (id)
  DO UPDATE SET
    last_number = registry.sequence_counters.last_number + 1,
    updated_at  = now()
  RETURNING last_number INTO v_next;

  RETURN p_company_code || '/' || p_prefix || '/' || p_year || '/'
         || LPAD(v_next::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════
-- REGISTRY AUDIT LOG
-- Append-only. No UPDATE or DELETE on this table ever.
-- pramaana.audit_log and suite.audit_log use identical structure.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE registry.audit_log (
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
  app             TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_registry_audit_company ON registry.audit_log(company_id);
CREATE INDEX idx_registry_audit_table   ON registry.audit_log(table_name);
CREATE INDEX idx_registry_audit_created ON registry.audit_log(created_at);
