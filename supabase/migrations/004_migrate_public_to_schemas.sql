-- ════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Data Migration: public.* → registry.* + suite.*
-- Migration: 004_migrate_public_to_schemas.sql
-- Prerequisite: 001, 002, 003 have all run successfully.
--
-- SIMPLIFIED based on actual row counts (June 2026):
--   Skipped (zero rows): buyers, products, purchase_orders, po_line_items,
--     invoices, invoice_line_items, invoice_packing_lines, sequence_counters
--   Skipped (technical records): public.audit_log (10 rows) — start fresh
--   Note: public.tally_config and public.tally_exports are both empty —
--     no migration needed when pramaana DDL runs.
--
-- Steps in this script:
--   1. UPDATE registry.companies from public.companies (address/prefix data)
--   2. INSERT registry.profiles from public.profiles
--   3. INSERT registry.company_users from public.user_companies + profiles.role
--   4. INSERT registry.app_access for all migrated users (suite access)
--   5. INSERT registry.entities + entity_roles from public.vendors
--   6. INSERT suite.delivery_addresses from public.delivery_addresses
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Update registry.companies with address/contact/prefix
-- data from public.companies.
-- The two rows were seeded in 002 with legacy_id set ('rhhf','rfpl').
-- ────────────────────────────────────────────────────────────────
UPDATE registry.companies rc
SET
  address_line1  = pc.address_line1,
  address_line2  = pc.address_line2,
  city           = pc.city,
  state          = pc.state,
  pincode        = pc.postal_code,
  phone          = pc.phone,
  email          = pc.email,
  logo_url       = pc.logo_url,
  po_prefix      = pc.po_prefix,
  invoice_prefix = pc.proforma_prefix,
  is_active      = pc.is_active
FROM public.companies pc
WHERE rc.legacy_id = pc.id;

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Migrate profiles → registry.profiles
-- Same UUID preserved (auth.users FK is identical).
-- role enum mapped: super_admin → is_super_admin = TRUE, all others → FALSE
-- entity_id left NULL — linked later via onboarding.
-- ────────────────────────────────────────────────────────────────
INSERT INTO registry.profiles (
  id, full_name, email, mobile,
  is_super_admin, is_active,
  created_at, updated_at
)
SELECT
  p.id,
  p.full_name,
  p.email,
  p.phone                        AS mobile,
  (p.role::TEXT = 'super_admin') AS is_super_admin,
  p.is_active,
  p.created_at,
  p.updated_at
FROM public.profiles p
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- STEP 3: Migrate company_users → registry.company_users
-- public.user_companies had NO role column — role inferred from profiles.role.
-- super_admin → 'admin' (is_super_admin on profiles handles platform override).
-- ────────────────────────────────────────────────────────────────
INSERT INTO registry.company_users (user_id, company_id, role, is_primary, created_at)
SELECT
  uc.user_id,
  rc.id AS company_id,
  CASE p.role::TEXT
    WHEN 'super_admin' THEN 'admin'
    WHEN 'admin'       THEN 'admin'
    WHEN 'accounts'    THEN 'accounts'
    WHEN 'auditor'     THEN 'auditor'
    WHEN 'operations'  THEN 'operations'
    ELSE                    'viewer'
  END   AS role,
  FALSE AS is_primary,
  uc.created_at
FROM public.user_companies uc
JOIN public.profiles p     ON p.id         = uc.user_id
JOIN registry.companies rc ON rc.legacy_id  = uc.company_id
ON CONFLICT (user_id, company_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- STEP 4: Grant suite app access to all migrated users
-- ────────────────────────────────────────────────────────────────
INSERT INTO registry.app_access (user_id, app, can_access, granted_at)
SELECT DISTINCT uc.user_id, 'suite', TRUE, now()
FROM public.user_companies uc
ON CONFLICT (user_id, app) DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- STEP 5: Migrate vendors → registry.entities + registry.entity_roles
-- Each public.vendors row → one entity (ORGANISATION) + one entity_role (Vendor).
-- bank_details is a raw text blob stored in bank_name for now; clean up manually.
-- ────────────────────────────────────────────────────────────────
WITH inserted_vendors AS (
  INSERT INTO registry.entities (
    type, display_name, alias,
    mobile, email,
    address_line1, address_line2, city, state, pincode, country,
    gstin, bank_name,
    is_active, source_app,
    legacy_suite_vendor_id,
    created_by, created_at, updated_at
  )
  SELECT
    'ORGANISATION'               AS type,
    v.name                       AS display_name,
    v.vendor_code                AS alias,
    v.phone                      AS mobile,
    v.email,
    v.address_line1,
    v.address_line2,
    v.city,
    v.state,
    v.postal_code                AS pincode,
    COALESCE(v.country, 'India') AS country,
    v.gstin,
    v.bank_details               AS bank_name,
    v.is_active,
    'suite'                      AS source_app,
    v.id                         AS legacy_suite_vendor_id,
    v.created_by,
    v.created_at,
    v.updated_at
  FROM public.vendors v
  RETURNING id, legacy_suite_vendor_id
)
INSERT INTO registry.entity_roles (entity_id, company_id, role, is_active, created_at)
SELECT
  iv.id,
  rc.id      AS company_id,
  'Vendor'   AS role,
  v.is_active,
  v.created_at
FROM inserted_vendors iv
JOIN public.vendors v      ON v.id         = iv.legacy_suite_vendor_id
JOIN registry.companies rc ON rc.legacy_id  = v.company_id;

-- ────────────────────────────────────────────────────────────────
-- STEP 6: Migrate delivery_addresses → suite.delivery_addresses
-- public.delivery_addresses has single 'address TEXT' → address_line1
-- ────────────────────────────────────────────────────────────────
INSERT INTO suite.delivery_addresses (
  id, company_id, label,
  address_line1, is_default, is_active, created_at
)
SELECT
  da.id,
  rc.id         AS company_id,
  da.label,
  da.address    AS address_line1,
  da.is_default,
  TRUE          AS is_active,
  da.created_at
FROM public.delivery_addresses da
JOIN registry.companies rc ON rc.legacy_id = da.company_id
ON CONFLICT (company_id, label) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- VERIFICATION
-- Run after migration to confirm row counts.
-- ════════════════════════════════════════════════════════════════
SELECT 'registry.companies'       AS table_name, COUNT(*) AS rows FROM registry.companies
UNION ALL
SELECT 'registry.profiles',        COUNT(*) FROM registry.profiles
UNION ALL
SELECT 'registry.company_users',   COUNT(*) FROM registry.company_users
UNION ALL
SELECT 'registry.app_access',      COUNT(*) FROM registry.app_access
UNION ALL
SELECT 'registry.entities',        COUNT(*) FROM registry.entities
UNION ALL
SELECT 'registry.entity_roles',    COUNT(*) FROM registry.entity_roles
UNION ALL
SELECT 'suite.delivery_addresses', COUNT(*) FROM suite.delivery_addresses
ORDER BY table_name;
