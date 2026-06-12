BEGIN;

-- ── Mobile normalisation utility (standalone — safe to run independently) ────
-- Fixes any approvals/manual entities whose mobiles are missing the + prefix.
-- Not needed after a clean reseed, but useful as a repair tool.

UPDATE registry.entities
SET mobile = '+' || mobile
WHERE source_app IN ('approvals', 'manual')
  AND mobile IS NOT NULL
  AND mobile NOT LIKE '+%'
  AND LENGTH(mobile) = 12
  AND mobile LIKE '91%';

UPDATE registry.entities
SET mobile = '+91' || mobile
WHERE source_app IN ('approvals', 'manual')
  AND mobile IS NOT NULL
  AND mobile NOT LIKE '+%'
  AND LENGTH(mobile) = 10;

COMMIT;

-- Verify — should return 0 rows after fix (VCT Traders 11-digit anomaly excluded)
SELECT id, display_name, mobile
FROM registry.entities
WHERE source_app IN ('approvals', 'manual')
  AND mobile IS NOT NULL
  AND mobile NOT LIKE '+%'
  AND LENGTH(mobile) != 11
ORDER BY display_name;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RELISH PLATFORM — Entity Seed from Approvals Payees
-- Migration: 022_seed_entities_from_approvals.sql
-- Generated: 2026-06-11  Reviewed & corrected: 2026-06-11
-- Source: Relish Approvals payee list (ewbguvwrejdvlhzcqlbp)
-- Target: registry.entities + registry.entity_roles (mmkbknnzgpvsqgnynrbe)
--
-- Corrections applied vs raw Approvals data:
--   • RESET block    — wipes prior approvals/manual records before reinserting
--                     (does NOT touch source_app = 'suite' records)
--   • Sherine Motty  → PERSON; role = Management; designation = Director
--   • KSEB           → role = Government (was Vendor)
--   • KSIDC          → role = Government (was Vendor)
--   • Motty Philip   → single PERSON entity; Management for both RHHF + RFPL
--   • Tarun Philip   → role = Management; designation = Director (was Staff)
--   • Anil Kumar     → single entity; Vendor role for both RFPL + RHHF
--   • Sebin Jose     → single entity; Vendor role for both RFPL + RHHF
--   • Shibu KB /
--     shibu (Tiles)  → same person confirmed (same mobile); single entity;
--                      Vendor RFPL + RHHF. Canonical name: Shibu KB.
--   • Vijayan /
--     Vijayan-Newspaper → same person (same mobile); merged with alias
--   • Excel Aluminium
--     Centre / Naseem   → same person (same mobile); merged with alias
--   • Veda Associates   → bank_name corrected (was in account_number column)
--   • Varghese (Electrician) /
--     Varghese John      → same person (same mobile); merged; Vendor RFPL + RHHF.
--                          Canonical: Varghese John. Alias: Varghese (Electrician)
--   • Motty Philip       → personal bank corrected to KVB Alappuzha
--                          (9446012324@okhdfc was RHHF company HDFC current a/c — NOT personal)
--                          UPI corrected: motty.philip@okicici (KVB)
--                          2nd personal a/c: ICICI 060601506230 / ICIC0000606 / motty.philip-2@okicici
--   • All Indian mobiles standardised to +91XXXXXXXXXX format
--
-- Safe to re-run: RESET block ensures clean slate each time.
-- Does NOT affect source_app = 'suite' records.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_rhhf             UUID;
  v_rfpl             UUID;
  eid                UUID;
  v_deleted_roles    INT;
  v_deleted_entities INT;
BEGIN

  -- ── STEP 1: Reset prior seed runs ────────────────────────────────────────────
  DELETE FROM registry.entity_roles
  WHERE entity_id IN (
    SELECT id FROM registry.entities
    WHERE source_app IN ('approvals', 'manual')
  );
  GET DIAGNOSTICS v_deleted_roles = ROW_COUNT;

  DELETE FROM registry.entities
  WHERE source_app IN ('approvals', 'manual');
  GET DIAGNOSTICS v_deleted_entities = ROW_COUNT;

  RAISE NOTICE 'Reset complete — removed % roles and % entities (approvals/manual).',
    v_deleted_roles, v_deleted_entities;

  -- ── STEP 2: Resolve company UUIDs ────────────────────────────────────────────
  SELECT id INTO v_rhhf FROM registry.companies WHERE code = 'RHHF';
  SELECT id INTO v_rfpl FROM registry.companies WHERE code = 'RFPL';

  IF v_rhhf IS NULL THEN RAISE EXCEPTION 'RHHF company not found in registry.companies'; END IF;
  IF v_rfpl IS NULL THEN RAISE EXCEPTION 'RFPL company not found in registry.companies'; END IF;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- CUSTOMERS
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ─── [1] Customer: FoodStream Ltd (RFPL) ──────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'FoodStream Ltd' AND mobile = '+85260528713';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, email,
      address_line1, address_line2, city, country,
      bank_name, bank_account_holder, bank_account_number, bank_swift,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'FoodStream Ltd', 'FoodStream HK',
      '+85260528713', 'trading@foodstream.co',
      'No. 26, 10/F Beverly Commercial Centre',
      '87-105 Chatham Road South, Tsim Sha Tsui',
      'Kowloon', 'Hong Kong',
      'HSBC Hong Kong', 'FoodStream Limited', '123-456789-001', 'HSBCHKHHHKH',
      'manual', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, notes, is_active)
  VALUES (eid, v_rfpl, 'Customer', 'FoodStream Ltd — HK', 'Hong Kong registered. Software delivery + seafood trading.', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- MANAGEMENT
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ─── [2] Management: Motty Philip (RHHF + RFPL) — single entity, two roles ───
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Motty Philip' AND mobile = '+919446012324';
  IF eid IS NULL THEN
    -- Personal bank 1 (primary): KVB Alappuzha A/c 1520155000001092 KVBL0001520 motty.philip@okicici
    -- Personal bank 2: ICICI Alappuzha A/c 060601506230 ICIC0000606 motty.philip-2@okicici
    INSERT INTO registry.entities (
      type, display_name, mobile, email, pan,
      address_line1, city, state, pincode, country,
      bank_name, bank_account_holder, bank_account_number, bank_ifsc, upi_id,
      source_app, is_active
    ) VALUES (
      'PERSON', 'Motty Philip',
      '+919446012324', 'motty.philip@gmail.com', 'ABCPM1234G',
      '26/599, M.O.Ward', 'Alappuzha', 'Kerala', '688001', 'India',
      'Karur Vysya Bank', 'Motty Philip', '1520155000001092', 'KVBL0001520', 'motty.philip@okicici',
      'manual', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, designation, notes, is_active)
  VALUES (eid, v_rhhf, 'Management', 'Motty Philip', 'Managing Partner', 'Principal partner — RHHF', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, designation, notes, is_active)
  VALUES (eid, v_rfpl, 'Management', 'Motty Philip', 'Executive Director', 'Executive Director — RFPL', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [3] Management: Tarun Philip (RFPL) ─────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Tarun Philip' AND mobile = '+916282845274';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc, upi_id,
      source_app, is_active
    ) VALUES (
      'PERSON', 'Tarun Philip', 'Director',
      '+916282845274', 'India',
      'Tarun Philip', '10150100305318', 'FDRL0001015', 'tarinphilip2308@okhdfcbank',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, designation, notes, is_active)
  VALUES (eid, v_rfpl, 'Management', 'Tarun Philip', 'Director', 'Director — RFPL', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [4] Management: Sherine Motty (RHHF) ────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sherine Motty' AND mobile = '+919446051944';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc, upi_id,
      source_app, is_active
    ) VALUES (
      'PERSON', 'Sherine Motty', 'Ammu',
      '+919446051944', 'India',
      'Sherine Motty', '10150100108712', 'FDRL0001015', 'sherinemotty@okaxis',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, designation, notes, is_active)
  VALUES (eid, v_rhhf, 'Management', 'Sherine Motty', 'Director', 'Director — RFPL; Partner — RHHF', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- STAFF
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ─── [5] Staff: Balachandran M N (RHHF) ──────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Balachandran M N' AND mobile = '+918281311799';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc, upi_id,
      source_app, is_active
    ) VALUES (
      'PERSON', 'Balachandran M N', 'Balan - Relish',
      '+918281311799', 'India',
      'Balachandran M N', '36109086934', 'SBIN0006982', 'bmn6242@oksbi',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Staff', 'Balachandran M N', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [6] Staff: Manu Antony (RHHF) ───────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Manu Antony' AND mobile = '+918553721409';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Manu Antony', 'Site Supervisor', '+918553721409', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, designation, is_active)
  VALUES (eid, v_rhhf, 'Staff', 'Manu Antony', 'Site Supervisor', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [7] Staff: Sangeetha Stalin (RHHF) ──────────────────────────────────────
  -- Note: +918714968746 is Sangeetha's real mobile. Several RHHF vendor entries
  -- share this number — they are different organisations using the same contact.
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sangeetha Stalin' AND mobile = '+918714968746';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country, upi_id, source_app, is_active
    ) VALUES (
      'PERSON', 'Sangeetha Stalin', 'Sangee',
      '+918714968746', 'India', 'sangeethavino1@oksbi', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Staff', 'Sangeetha Stalin', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- GOVERNMENT
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ─── [8] Government: KSEB (RHHF) ─────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'KSEB' AND mobile = '+919048401711';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'KSEB', '+919048401711', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, notes, is_active)
  VALUES (eid, v_rhhf, 'Government', 'KSEB', 'Kerala State Electricity Board — Arookutty section', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [9] Government: KSIDC (RHHF) ────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities
    WHERE display_name = 'Kerala State Industrial Development Corporation Limited' AND mobile = '+919446012324';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country, source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Kerala State Industrial Development Corporation Limited', 'KSIDC',
      '+919446012324', 'India', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, notes, is_active)
  VALUES (eid, v_rhhf, 'Government', 'KSIDC', 'Institutional funder', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- VENDORS — RFPL (individuals)
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ─── [10] Vendor: Abin Peter (RFPL) ──────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Abin Peter' AND mobile = '+917034233104';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Abin Peter', '+917034233104', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Abin Peter', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [11] Vendor: Anil Kumar (RFPL + RHHF) — single entity, two roles ─────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Anil Kumar' AND mobile = '+919539376498';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country, upi_id, source_app, is_active
    ) VALUES (
      'PERSON', 'Anil Kumar', '+919539376498', 'India', 'anilkumaarm75@okhdfcbank', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Anil Kumar', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Anil Kumar', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [12] Vendor: Denny (RFPL) ───────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Denny' AND mobile = '+919645378358';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Denny', '+919645378358', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Denny', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [13] Vendor: Dethan V S (RFPL) ──────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Dethan V S' AND mobile = '+917907481346';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Dethan V S', '+917907481346', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Dethan V S', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [14] Vendor: Ebin Boban (RFPL) ──────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Ebin Boban' AND mobile = '+917025069541';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Ebin Boban', 'Tille Work', '+917025069541', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Ebin Boban', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [15] Vendor: Excel Aluminium Centre / Naseem (RFPL) — same mobile, merged ─
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Excel Aluminium Centre' AND mobile = '+919349421496';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Excel Aluminium Centre', 'Naseem', '+919349421496', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Excel Aluminium Centre', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [16] Vendor: Francise Varghese (RFPL) ───────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Francise Varghese' AND mobile = '+917907285238';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Francise Varghese', 'Anni', '+917907285238', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Francise Varghese', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [17] Vendor: Girish Kumar (RFPL) ────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Girish Kumar' AND mobile = '+919947371319';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Girish Kumar', '+919947371319', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Girish Kumar', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [18] Vendor: Jithin Scaria (RFPL) ───────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Jithin Scaria' AND mobile = '+918089926337';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Jithin Scaria', 'Jithin', '+918089926337', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Jithin Scaria', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [19] Vendor: Kochumon (Plumber) (RFPL) ──────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Kochumon (Plumber)' AND mobile = '+918590980036';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Kochumon (Plumber)', '+918590980036', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Kochumon (Plumber)', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [20] Vendor: Kunjumol (Maid Night) (RFPL) ───────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Kunjumol' AND mobile = '+919947996363';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Kunjumol', 'Kunjumol Maid - Night', '+919947996363', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Kunjumol', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [21] Vendor: Kunjumol (Maid Day) (RFPL) — different mobile, different person
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Kunjumol' AND mobile = '+919526712143';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Kunjumol', 'Kunjumol Maid - Day', '+919526712143', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Kunjumol', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [22] Vendor: Manu (RFPL) ────────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Manu' AND mobile = '+919846924682';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Manu', '+919846924682', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Manu', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [23] Vendor: Mercy - Abdul Rahim & Co. (RFPL) ───────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Mercy - Abdul Rahim & Co.' AND mobile = '+919846959333';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Mercy - Abdul Rahim & Co.', '+919846959333', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Mercy - Abdul Rahim & Co.', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [24] Vendor: Mohannan (Timber Manufacturing) (RFPL) ─────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Mohannan (Timber Manufacturing)' AND mobile = '+919947640485';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Mohannan (Timber Manufacturing)', '+919947640485', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Mohannan (Timber Manufacturing)', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [25] Vendor: Raghu (RFPL) ───────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Raghu' AND mobile = '+919847956624';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Raghu', 'Electrician', '+919847956624', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Raghu', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [26] Vendor: Sajeev (RFPL) ──────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sajeev' AND mobile = '+919895870207';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Sajeev', '+919895870207', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Sajeev', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [27] Vendor: Saji (RFPL) ────────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Saji' AND mobile = '+917510756234';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Saji', '+917510756234', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Saji', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [28] Vendor: Sebin Jose (RFPL + RHHF) — single entity, two roles ─────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sebin Jose' AND mobile = '+919747815488';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country, upi_id, source_app, is_active
    ) VALUES (
      'PERSON', 'Sebin Jose', '+919747815488', 'India', 'sebinjose480@oksbi', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Sebin Jose', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Sebin Jose', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [29] Vendor: Vijayan (RFPL) — merged with Vijayan-Newspaper (same mobile) ─
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Vijayan' AND mobile = '+919142724673';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Vijayan', 'Vijayan - Newspaper', '+919142724673', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Vijayan', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [30] Vendor: Vishnu (RFPL) ──────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Vishnu' AND mobile = '+918891734448';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Vishnu', '+918891734448', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Vishnu', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- VENDORS — RFPL (organisations)
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ─── [31] Vendor: Mahadeva Electricals & Sanitary (RFPL) ─────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Mahadeva Electricals & Sanitary' AND mobile = '+919847490400';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Mahadeva Electricals & Sanitary', '+919847490400', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Mahadeva Electricals & Sanitary', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [32] Vendor: Malabar Agencies (RFPL) ────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Malabar  Agencies' AND mobile = '+919846290914';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Malabar  Agencies', '+919846290914', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Malabar  Agencies', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [33] Vendor: P R Traders (RFPL) ─────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'P R Traders' AND mobile = '+919947247336';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'P R Traders', '+919947247336', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'P R Traders', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [34] Vendor: P.A.George & Co. Alappuzha (RFPL) ──────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'P.A.George & Co. (Alappuzha)' AND mobile = '+918714968746';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'P.A.George & Co. (Alappuzha)', '+918714968746', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'P.A.George & Co. (Alappuzha)', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [35] Vendor: Parayil Timber Industries (RFPL) ───────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Parayil Timber Industries' AND mobile = '+919495119678';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Parayil Timber Industries', '+919495119678', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Parayil Timber Industries', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [36] Vendor: PKP Auto Electricals (RFPL) ────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'PKP Auto Electricals' AND mobile = '+918714968746';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'PKP Auto Electricals', '+918714968746', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'PKP Auto Electricals', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [37] Vendor: Powermech Diesels (RFPL) ───────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Powermech Diesels' AND mobile = '+919447734111';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Powermech Diesels', 'Powermech', '+919447734111', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Powermech Diesels', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [38] Vendor: Pulimoottil Earth Movers (RFPL) ────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Pulimoottil Earth Movers' AND mobile = '+919495710895';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Pulimoottil Earth Movers', '+919495710895', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Pulimoottil Earth Movers', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [39] Vendor: Shikha Metals Pvt Ltd (RFPL) ───────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Shikha Metals Pvt Ltd' AND mobile = '+919847300122';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Shikha Metals Pvt Ltd', 'Shika Metals',
      '+919847300122', 'India',
      'Shikha Metals Pvt Ltd', '564044030028', 'KKBK0009016',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Shikha Metals Pvt Ltd', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [40] Vendor: Shree Krishna Sheets & Pipes (RFPL) ────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Shree Krishna Sheets & Pipes' AND mobile = '+919447112152';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Shree Krishna Sheets & Pipes', 'Shree Krishna - Metals',
      '+919447112152', 'India',
      'Shree Krishna Sheets & Pipes', '39535509715', 'SBIN0070457',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Shree Krishna Sheets & Pipes', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [41] Vendor: Sicagen India Limited / TATA Steels (RFPL) ─────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sicagen India Limited' AND mobile = '+919539011622';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Sicagen India Limited', 'Sicagen - TATA Steels',
      '+919539011622', 'India',
      'Sicagen India Limited', '50200068367084', 'HDFC0007103',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Sicagen India Limited', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [42] Vendor: Sibi (RFPL) ────────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sibi' AND mobile = '+918921953917';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Sibi', '+918921953917', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Sibi', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [43] Vendor: Silver Frame Emporium (RFPL) ───────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Silver Frame Emporium' AND mobile = '+919847040708';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Silver Frame Emporium', '+919847040708', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Silver Frame Emporium', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [44] Vendor: Sunny - Fabrication (RFPL) ─────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sunny - Fabrication' AND mobile = '+919349355395';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Sunny - Fabrication', '+919349355395', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Sunny - Fabrication', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [45] Vendor: Tranzet Technolabs Private LMT (RFPL) ──────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Tranzet Technolabs Private LMT' AND mobile = '+919400061175';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Tranzet Technolabs Private LMT', '+919400061175', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Tranzet Technolabs Private LMT', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [46] Vendor: Varghese John (RFPL + RHHF) — single entity, two roles ──────
  -- Same person confirmed — same mobile +919895499921.
  -- Canonical name: Varghese John. Alias: Varghese (Electrician) (RFPL trading name).
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Varghese John' AND mobile = '+919895499921';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Varghese John', 'Varghese (Electrician)', '+919895499921', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'Varghese (Electrician)', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Varghese John', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [47] Vendor: New Rajasthan Marbles (RFPL) ───────────────────────────────
  -- Note: shares mobile with Motty Philip — likely used as contact at time of entry
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'New Rajasthan Marbles' AND mobile = '+919446012324';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'New Rajasthan Marbles', '+919446012324', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'New Rajasthan Marbles', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════════════════
  -- VENDORS — RHHF (individuals & organisations)
  -- ══════════════════════════════════════════════════════════════════════════════

  -- ─── [48] Vendor: I S Electricals (RHHF) ─────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'I S Electricals' AND mobile = '+919288908029';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'I S Electricals', '+919288908029', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'I S Electricals', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [49] Vendor: TWINSQUAD ESSENTIALS PVT LTD (RHHF) ───────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'TWINSQUAD ESSENTIALS PVT LTD' AND mobile = '+919940135495';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'TWINSQUAD ESSENTIALS PVT LTD', '+919940135495', 'India',
      'TWINSQUAD ESSENTIALS PVT LTD', '50200050834361', 'HDFC0000260',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'TWINSQUAD ESSENTIALS PVT LTD', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [50] Vendor: A K Musaliyar Constructional Trades (RHHF) ─────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'A K Musaliyar Constructional  Trades' AND mobile = '+919249421592';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'A K Musaliyar Constructional  Trades', 'Ahamed Khabeer',
            '+919249421592', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'A K Musaliyar Constructional  Trades', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [51] Vendor: A1 Travels and Speed Parcel Service (RHHF) ─────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'A1 Travels and Speed Parcel Service' AND mobile = '+919626092552';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'A1 Travels and Speed Parcel Service', '+919626092552', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'A1 Travels and Speed Parcel Service', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [52] Vendor: Alakappan Sudhir (RHHF) ────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Alakappan Sudhir' AND mobile = '+919497342655';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Alakappan Sudhir', '+919497342655', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Alakappan Sudhir', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [53] Vendor: Alif HARDWARE 26-27 (RHHF) ─────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Alif HARDWARE 26- 27' AND mobile = '+918714968746';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Alif HARDWARE 26- 27', '+918714968746', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Alif HARDWARE 26- 27', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [54] Vendor: Anna Agencies (RHHF) ───────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Anna Agencies' AND mobile = '+918714968746';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Anna Agencies', '+918714968746', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Anna Agencies', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [55] Vendor: Ansil Hassan (RHHF) ────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Ansil Hassan' AND mobile = '+919567628138';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Ansil Hassan', 'Ansil', '+919567628138', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Ansil Hassan', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [56] Vendor: Antony (RHHF) ──────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Antony' AND mobile = '+919847057700';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Antony', 'Malayil', '+919847057700', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Antony', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [57] Vendor: Anzil A K (RHHF) ──────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Anzil A K' AND mobile = '+919605714100';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Anzil A K', 'Anzil Driver', '+919605714100', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Anzil A K', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [58] Vendor: ARV AUTOLAND LLP (TVS) (RHHF) ──────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'ARV AUTOLAND LLP (TVS)' AND mobile = '+919645114682';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'ARV AUTOLAND LLP (TVS)', '+919645114682', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'ARV AUTOLAND LLP (TVS)', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [59] Vendor: ASHKAR (RHHF) ──────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'ASHKAR' AND mobile = '+918590689253';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'ASHKAR', '+918590689253', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'ASHKAR', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [60] Vendor: Ashraf (RHHF) ──────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Ashraf' AND mobile = '+919846224485';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country, upi_id, source_app, is_active
    ) VALUES (
      'PERSON', 'Ashraf', 'Ashraf - Plumber',
      '+919846224485', 'India', 'ashereef859@okicici', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Ashraf', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [61] Vendor: Athira (RHHF) ──────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Athira' AND mobile = '+919746033085';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Athira', '+919746033085', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Athira', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [62] Vendor: Baburaraj Electrical & Sanitary Wares (RHHF) ───────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Baburaraj Electrical & Sanitary Wares' AND mobile = '+919846662632';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Baburaraj Electrical & Sanitary Wares', '+919846662632', 'India',
      'Baburaraj Electrical & Sanitary Wares', '50200071049613', 'HDFC0009697',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Baburaraj Electrical & Sanitary Wares', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [63] Vendor: Binoy (RHHF) ───────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Binoy' AND mobile = '+918943125320';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country, upi_id, source_app, is_active
    ) VALUES (
      'PERSON', 'Binoy', 'Binoy-Electrician',
      '+918943125320', 'India', 'jjosephcletus@oksbi', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Binoy', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [64] Vendor: Breeze Electricals (RHHF) ──────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Breeze Electricals' AND mobile = '+919746869925';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Breeze Electricals', '+919746869925', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Breeze Electricals', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [65] Vendor: Drishya Engineering and Consultancy Services Pvt Ltd (RHHF) ─
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Drishya Engineering and Consultancy Services Pvt Ltd' AND mobile = '+918086999219';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Drishya Engineering and Consultancy Services Pvt Ltd', 'Drishya Engineering',
      '+918086999219', 'India',
      'Drishya Engineering and Consultancy Services Pvt Ltd', '851120110000170', 'BKID0008511',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Drishya Engineering and Consultancy Services Pvt Ltd', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [66] Vendor: Electro Dynamic (RHHF) ─────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Electro Dynamic' AND mobile = '+919847244993';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country,
      bank_account_holder, bank_account_number,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Electro Dynamic', '+919847244993', 'India',
      'Electro Dynamic', '07600200000317',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Electro Dynamic', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [67] Vendor: Fidha Sanitary Centre (RHHF) ───────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Fidha Sanitary Centre' AND mobile = '+919526746756';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Fidha Sanitary Centre', '+919526746756', 'India',
      'Fidha Sanitary Centre', '125006904608', 'CNRB0007442',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Fidha Sanitary Centre', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [68] Vendor: Gopan (RHHF) ───────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Gopan' AND mobile = '+918281656263';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Gopan', '+918281656263', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Gopan', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [69] Vendor: Home Ceramica (RHHF) ───────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Home Ceramica' AND mobile = '+918714968746';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Home Ceramica', '+918714968746', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Home Ceramica', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [70] Vendor: Hydro Guard / Sibi (RHHF) ──────────────────────────────────
  -- Same person as [42] Sibi (RFPL) — confirmed same mobile. Different trading name
  -- used across companies. Kept as separate entity since display_name differs.
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Hydro Guard' AND mobile = '+918921953917';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Hydro Guard', 'Sibi', '+918921953917', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Hydro Guard', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [71] Vendor: Jacab John & CO (RHHF) ─────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Jacab John & CO' AND mobile = '+919495951947';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Jacab John & CO', '+919495951947', 'India',
      'Jacab John & CO', '125008936541', 'CNRB0007442',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Jacab John & CO', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [72] Vendor: Jayakumar B (RHHF) ─────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Jayakumar B' AND mobile = '+919746869925';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Jayakumar B', 'Jayakumar -Electrical', '+919746869925', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Jayakumar B', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [73] Vendor: Jetty Agencies (RHHF) ──────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Jetty Agencies' AND mobile = '+919288908029';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Jetty Agencies', '+919288908029', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Jetty Agencies', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [74] Vendor: Jinoy Antony (RHHF) ────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Jinoy Antony' AND mobile = '+919544228816';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Jinoy Antony', '+919544228816', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Jinoy Antony', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [75] Vendor: Kalavara Traders (RHHF) ────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Kalavara Traders' AND mobile = '+919847232541';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Kalavara Traders', '+919847232541', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Kalavara Traders', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [76] Vendor: KAMBIYAKATH TILES & Granites (RHHF) ────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'KAMBIYAKATH TILES & Granites' AND mobile = '+918714968746';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'KAMBIYAKATH TILES & Granites', '+918714968746', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'KAMBIYAKATH TILES & Granites', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [77] Vendor: Kumar (RHHF) ───────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Kumar' AND mobile = '+919961302102';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Kumar', '+919961302102', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Kumar', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [78] Vendor: Lamp House (RHHF) ──────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Lamp House' AND mobile = '+919947034700';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Lamp House', '+919947034700', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Lamp House', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [79] Vendor: Manikumar (RHHF) ───────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Manikumar' AND mobile = '+919994102838';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Manikumar', 'Manikumar - Cleaning', '+919994102838', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Manikumar', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [80] Vendor: Matha Sanitary Centre (RHHF) ───────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Matha Sanitary Centre' AND mobile = '+918714968746';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Matha Sanitary Centre', '+918714968746', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Matha Sanitary Centre', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [81] Vendor: Max Metals & Hardwares (RHHF) ──────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Max Metals & Hardwares' AND mobile = '+919446500055';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Max Metals & Hardwares', '+919446500055', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Max Metals & Hardwares', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [82] Vendor: Midhun (RHHF) ──────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Midhun' AND mobile = '+918089327618';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Midhun', '+918089327618', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Midhun', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [83] Vendor: Mohammed Shafi (RHHF) ──────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Mohammed Shafi' AND mobile = '+919633068489';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Mohammed Shafi', 'Shafi', '+919633068489', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Mohammed Shafi', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [84] Vendor: Mohannan (Electrician/Plumber - Pannavally) (RHHF) ──────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Mohannan (Electrician/Plumber - Pannavally)' AND mobile = '+919288908029';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Mohannan (Electrician/Plumber - Pannavally)', 'Mohannan',
            '+919288908029', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Mohannan (Electrician/Plumber - Pannavally)', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [85] Vendor: Mullasseri Hardwares (RHHF) ────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Mullasseri Hardwares' AND mobile = '+919446545646';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Mullasseri Hardwares', 'Mullasseri', '+919446545646', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Mullasseri Hardwares', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [86] Vendor: Muthusamy (RHHF) ───────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Muthusamy' AND mobile = '+919847056752';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Muthusamy', '+919847056752', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Muthusamy', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [87] Vendor: Nelca Fabrication (RHHF) ───────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Nelca Fabrication' AND mobile = '+919895104959';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Nelca Fabrication', '+919895104959', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Nelca Fabrication', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [88] Vendor: Niram Paints (RHHF) ────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Niram Paints' AND mobile = '+919895971661';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Niram Paints', '+919895971661', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Niram Paints', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [89] Vendor: Prabhu Steel (RHHF) ────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Prabhu Steel' AND mobile = '+918086001192';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Prabhu Steel', '+918086001192', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Prabhu Steel', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [90] Vendor: Real Computers (RHHF) ──────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Real Computers' AND mobile = '+919388880791';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Real Computers', '+919388880791', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Real Computers', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [91] Vendor: Reji (RHHF) ────────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Reji' AND mobile = '+919847240160';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Reji', '+919847240160', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Reji', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [92] Vendor: Renjith (RHHF) ─────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Renjith' AND mobile = '+919847056752';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country,
      bank_account_holder, bank_account_number,
      source_app, is_active
    ) VALUES (
      'PERSON', 'Renjith', '+919847056752', 'India',
      'Renjith', '50200067794128',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Renjith', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [93] Vendor: Robin (RHHF) ───────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Robin' AND mobile = '+919544172021';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country, upi_id, source_app, is_active
    ) VALUES (
      'PERSON', 'Robin', '+919544172021', 'India', 'r2729640@okicici', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Robin', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [94] Vendor: Rony (RHHF) ────────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Rony' AND mobile = '+919995327035';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Rony', '+919995327035', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Rony', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [95] Vendor: Sajimon Yousef (RHHF) ──────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sajimon Yousef' AND mobile = '+919895104959';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Sajimon Yousef', 'Saji Panavalli', '+919895104959', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Sajimon Yousef', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [96] Vendor: Sangeetha Tourist Home (RHHF) ──────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sangeetha Tourist Home' AND mobile = '+919447034935';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Sangeetha Tourist Home', '+919447034935', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Sangeetha Tourist Home', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [97] Vendor: Sanish Pannavally (RHHF) ───────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sanish Pannavally' AND mobile = '+919745635346';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Sanish Pannavally', '+919745635346', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Sanish Pannavally', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [98] Vendor: Sanu Satheeshan (RHHF) ────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sanu Satheeshan' AND mobile = '+918589889596';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Sanu Satheeshan', '+918589889596', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Sanu Satheeshan', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [99] Vendor: Sara Living Solutions (RHHF) ───────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sara Living Solutions' AND mobile = '+917012182637';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, alias, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Sara Living Solutions', 'Sara', '+917012182637', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Sara Living Solutions', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [100] Vendor: Sathyan (RHHF) ────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sathyan' AND mobile = '+919995304498';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country, upi_id, source_app, is_active
    ) VALUES (
      'PERSON', 'Sathyan', '+919995304498', 'India', 'sathyanmini73-1@okhdfcbank', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Sathyan', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [101] Vendor: Shahish (RHHF) ────────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Shahish' AND mobile = '+919846985927';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Shahish', '+919846985927', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Shahish', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [102] Vendor: Shan Tools & Hardwares (RHHF) ─────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Shan Tools & Hardwares' AND mobile = '+919746869925';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'Shan Tools & Hardwares', '+919746869925', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Shan Tools & Hardwares', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [103] Vendor: Shibu KB (RFPL + RHHF) — MERGED (was also shibu (Tiles)) ──
  -- Same person confirmed — same mobile +919446819454.
  -- Canonical name: Shibu KB. Alias: shibu (Tiles). Vendor in both companies.
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Shibu KB' AND mobile = '+919446819454';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country, upi_id, source_app, is_active
    ) VALUES (
      'PERSON', 'Shibu KB', 'shibu (Tiles)',
      '+919446819454', 'India', 'shibukb468@oksbi', 'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rfpl, 'Vendor', 'shibu (Tiles)', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Shibu KB', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [104] Vendor: Sundaran KV (RHHF) ────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Sundaran KV' AND mobile = '+918921428382';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Sundaran KV', '+918921428382', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Sundaran KV', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [105] Vendor: Syam Kumar (RHHF) ─────────────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Syam Kumar' AND mobile = '+919447798210';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('PERSON', 'Syam Kumar', '+919447798210', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Syam Kumar', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [106] Vendor: Thiruvonam Agencies (RHHF) ────────────────────────────────
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Thiruvonam Agencies' AND mobile = '+916282494098';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, mobile, country,
      bank_account_holder, bank_account_number, bank_ifsc, upi_id,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Thiruvonam Agencies', '+916282494098', 'India',
      'Thiruvonam Agencies', '12690200007502', 'FDRL0001269', 'thiruvonamagen1@fbl',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Thiruvonam Agencies', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [107] Vendor: Varghese John (RHHF) — merged into [46] (same person as Varghese (Electrician) RFPL) ──

  -- ─── [108] Vendor: VCT Traders (RHHF) ────────────────────────────────────────
  -- ⚠ Mobile '99947151524' is 11 digits — data entry anomaly from Approvals source.
  -- Stored as-is; verify with vendor before correcting.
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'VCT Traders' AND mobile = '99947151524';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (type, display_name, mobile, country, source_app, is_active)
    VALUES ('ORGANISATION', 'VCT Traders', '99947151524', 'India', 'approvals', TRUE)
    RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'VCT Traders', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  -- ─── [109] Vendor: Veda Associates (RHHF) ────────────────────────────────────
  -- Fixed: bank_name was incorrectly placed in bank_account_number column in source data
  SELECT id INTO eid FROM registry.entities WHERE display_name = 'Veda Associates' AND mobile = '+917907697877';
  IF eid IS NULL THEN
    INSERT INTO registry.entities (
      type, display_name, alias, mobile, country,
      bank_name, bank_account_holder,
      source_app, is_active
    ) VALUES (
      'ORGANISATION', 'Veda Associates', 'Veda Associates',
      '+917907697877', 'India',
      'HDFC Bank', 'Veda Associates',
      'approvals', TRUE
    ) RETURNING id INTO eid;
  END IF;
  INSERT INTO registry.entity_roles (entity_id, company_id, role, tally_ledger, is_active)
  VALUES (eid, v_rhhf, 'Vendor', 'Veda Associates', TRUE)
  ON CONFLICT (entity_id, company_id, role) DO NOTHING;

  RAISE NOTICE 'Entity seed complete — 108 entity blocks processed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification queries — run after the block above succeeds
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT
  COUNT(*)                                      AS total_entities,
  COUNT(*) FILTER (WHERE type = 'PERSON')       AS persons,
  COUNT(*) FILTER (WHERE type = 'ORGANISATION') AS organisations
FROM registry.entities
WHERE source_app IN ('approvals', 'manual');

SELECT role, COUNT(*) AS count
FROM registry.entity_roles er
JOIN registry.entities e ON e.id = er.entity_id
WHERE e.source_app IN ('approvals', 'manual')
GROUP BY role ORDER BY count DESC;
