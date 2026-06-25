# Relish Suite — System Definition
**Generated:** 2026-06-19  
**Scope:** `relish-business-suite` repo only — `src/`, `api/`, `supabase/migrations/`  
**Method:** Direct code inspection of all lib files, page components, migrations, and config files  
**Not covered:** Pramaana (`pramaana/` subfolder), ClamFlow backend/frontend (separate repos)

---

## 1. Database Schema

### 1.1 Supabase Projects Connected

| Client variable | Project ID | Access mode |
|---|---|---|
| `supabase` (primary) | `mmkbknnzgpvsqgnynrbe` | READ + WRITE |
| `supabaseApprovalsReadOnly` | `ewbguvwrejdvlhzcqlbp` | READ ONLY — enforced by convention, no DB-level restriction |
| `supabaseClamFlow` | `idwgenbkguejgwtzbicu` | READ ONLY — enforced by convention, no DB-level restriction |

---

### 1.2 Tables in `registry` schema (primary DB)

#### `registry.companies`
**Suite READS. WRITES only via `super_admin` role through `updateCompany()`.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| code | TEXT | NOT NULL | — | UNIQUE. Values: `'RHHF'`, `'RFPL'` |
| name | TEXT | NOT NULL | — | |
| legal_name | TEXT | YES | — | |
| short_name | TEXT | YES | — | |
| entity_type | TEXT | NOT NULL | — | CHECK IN ('Proprietorship','Partnership','LLP','Private Limited') |
| gstin | TEXT | YES | — | |
| pan | TEXT | YES | — | |
| cin | TEXT | YES | — | RFPL only |
| tan | TEXT | YES | — | |
| address_line1–2 | TEXT | YES | — | |
| city, state | TEXT | YES | — | |
| state_code | TEXT | YES | — | '32' Kerala, '33' Tamil Nadu |
| pincode | TEXT | YES | — | |
| country | TEXT | YES | `'India'` | |
| phone, email | TEXT | YES | — | |
| logo_url | TEXT | YES | — | |
| po_prefix, invoice_prefix | TEXT | YES | — | |
| fy_start_month | INT | YES | `4` | April |
| tally_company_name | TEXT | YES | — | Must match Tally Prime exactly |
| legacy_id | TEXT | YES | — | Old text PK ('rhhf', 'rfpl') |
| is_active | BOOLEAN | YES | `TRUE` | |
| created_at | TIMESTAMPTZ | YES | `now()` | |

**RLS:** `DISABLED` (fixed in migration 006 — all authenticated users can read).

---

#### `registry.profiles`
**Suite READS on login. WRITES `full_name`, `email`, `mobile`, `is_active` only via `updateProfile()`.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | — | PK. FK → auth.users(id) ON DELETE CASCADE |
| full_name | TEXT | NOT NULL | — | |
| email | TEXT | YES | — | |
| mobile | TEXT | YES | — | UNIQUE |
| mobile_verified | BOOLEAN | YES | FALSE | |
| is_super_admin | BOOLEAN | YES | FALSE | Platform-level override; synthetic `super_admin` role derived from this |
| is_active | BOOLEAN | YES | TRUE | |
| entity_id | UUID | YES | — | Soft FK → registry.entities (DEFERRABLE) |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |
| last_login | TIMESTAMPTZ | YES | — | |

**RLS policy `own_profile`:**
```sql
FOR ALL USING (id = auth.uid() OR registry.is_super_admin())
```

---

#### `registry.company_users`
**Suite READS on login. WRITES INSERT (assign) and DELETE (remove) via user management. No UPDATE.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| user_id | UUID | NOT NULL | — | FK → auth.users(id) ON DELETE CASCADE |
| company_id | UUID | NOT NULL | — | FK → registry.companies(id) |
| role | TEXT | NOT NULL | — | CHECK IN ('admin','accounts','auditor','hr','operations','viewer') |
| is_primary | BOOLEAN | YES | FALSE | |
| created_at | TIMESTAMPTZ | YES | now() | |

**UNIQUE:** `(user_id, company_id)`

**RLS policy `company_users_visibility`:**
```sql
USING (user_id = auth.uid() OR registry.is_super_admin())
```

---

#### `registry.app_access`
**Suite READS on login (checks `app='suite'`, `can_access=false` → forced sign-out). Does not WRITE.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| user_id | UUID | NOT NULL | — | FK → auth.users(id) ON DELETE CASCADE |
| app | TEXT | NOT NULL | — | CHECK IN ('suite','pramaana','clamflow') |
| can_access | BOOLEAN | YES | TRUE | |
| granted_by | UUID | YES | — | FK → auth.users(id) |
| granted_at | TIMESTAMPTZ | YES | now() | |

**PK:** `(user_id, app)`  
**RLS:** Not explicitly set in migrations — uncertain whether RLS is enabled on this table. Needs verification.

---

#### `registry.entities`
**Suite READS (vendor/buyer/entity lookups). WRITES INSERT+UPDATE via vendor, buyer, and entities lib functions.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| type | TEXT | NOT NULL | — | CHECK IN ('PERSON','ORGANISATION') |
| display_name | TEXT | NOT NULL | — | |
| alias | TEXT | YES | — | |
| pan | TEXT | YES | — | |
| pan_verified | BOOLEAN | YES | FALSE | |
| mobile | TEXT | YES | — | |
| mobile_alt | TEXT | YES | — | |
| email | TEXT | YES | — | |
| address_line1–2 | TEXT | YES | — | |
| city, state | TEXT | YES | — | |
| pincode | TEXT | YES | — | |
| country | TEXT | YES | `'India'` | |
| legal_name | TEXT | YES | — | |
| gstin | TEXT | YES | — | |
| gstin_verified | BOOLEAN | YES | FALSE | |
| gstin_verified_at | TIMESTAMPTZ | YES | — | |
| cin | TEXT | YES | — | |
| organisation_type | TEXT | YES | — | |
| boat_registration | TEXT | YES | — | |
| first_name, last_name | TEXT | YES | — | |
| date_of_birth | DATE | YES | — | |
| gender | TEXT | YES | — | CHECK IN ('Male','Female','Other','Unspecified') |
| aadhaar_last4 | TEXT | YES | — | Last 4 digits only. Full Aadhaar NEVER stored. |
| aadhaar_verified | BOOLEAN | YES | FALSE | |
| aadhaar_verified_at | TIMESTAMPTZ | YES | — | |
| aadhaar_ref_token | TEXT | YES | — | Provider token, NOT the number |
| bank_name | TEXT | YES | — | |
| bank_account_holder | TEXT | YES | — | |
| bank_account_number | TEXT | YES | — | |
| bank_ifsc | TEXT | YES | — | India-only 11-char code |
| bank_swift | TEXT | YES | — | Added migration 010: overseas payees |
| upi_id | TEXT | YES | — | |
| payment_verified | BOOLEAN | YES | FALSE | |
| suspense_eligible | BOOLEAN | YES | FALSE | |
| requires_otp | BOOLEAN | YES | TRUE | |
| payee_type | TEXT | YES | `'registered'` | CHECK IN ('registered','adhoc') |
| is_global | BOOLEAN | YES | FALSE | |
| source_app | TEXT | YES | `'suite'` | |
| local_reg_number | TEXT | YES | — | Added migration 011: overseas co. reg. |
| local_tax_number | TEXT | YES | — | Added migration 011: overseas VAT/tax reg. |
| legacy_clamflow_person_id | UUID | YES | — | |
| legacy_clamflow_supplier_id | UUID | YES | — | |
| legacy_approvals_payee_id | UUID | YES | — | |
| legacy_approvals_user_id | UUID | YES | — | |
| legacy_suite_vendor_id | UUID | YES | — | |
| legacy_suite_buyer_id | UUID | YES | — | |
| is_active | BOOLEAN | YES | TRUE | |
| created_by | UUID | YES | — | FK → auth.users(id) |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

**RLS policy `entity_visibility`:**
```sql
USING (
  is_global = TRUE
  OR created_by = auth.uid()
  OR id IN (
    SELECT er.entity_id FROM registry.entity_roles er
    WHERE registry.has_company_access(er.company_id)
  )
  OR EXISTS (
    SELECT 1 FROM registry.profiles
    WHERE id = auth.uid() AND is_super_admin = TRUE
  )
)
```

---

#### `registry.entity_roles`
**Suite READS (vendor/buyer/entity lists). WRITES INSERT+UPDATE via vendor, buyer, and entities lib functions.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| entity_id | UUID | NOT NULL | — | FK → registry.entities(id) ON DELETE CASCADE |
| company_id | UUID | NOT NULL | — | FK → registry.companies(id) |
| role | TEXT | NOT NULL | — | CHECK IN ('Management','Staff','Vendor','Supplier','Customer','Auditor','Government','Fisher','Contractor') |
| employee_id | TEXT | YES | — | |
| staff_id_code | TEXT | YES | — | |
| department | TEXT | YES | — | |
| designation | TEXT | YES | — | |
| date_joined | DATE | YES | — | |
| date_left | DATE | YES | — | |
| credit_limit | NUMERIC(15,2) | YES | — | |
| credit_days | INT | YES | — | |
| tally_ledger | TEXT | YES | — | Displayed as "Pramaana Ledger Name" in UI |
| pramaana_ledger_id | UUID | YES | — | Soft ref to pramaana.ledgers.id — NOT a DB FK |
| station | TEXT | YES | — | |
| supplier_type | TEXT | YES | — | |
| category | TEXT | YES | — | |
| notes | TEXT | YES | — | |
| is_active | BOOLEAN | YES | TRUE | |
| created_at | TIMESTAMPTZ | YES | now() | |

**UNIQUE:** `(entity_id, company_id, role)`

**RLS policy `entity_roles_visibility`:**
```sql
USING (
  registry.has_company_access(company_id)
  OR EXISTS (
    SELECT 1 FROM registry.profiles
    WHERE id = auth.uid() AND is_super_admin = TRUE
  )
)
```

---

#### `registry.audit_log`
**Suite WRITES only (INSERT via `writeAuditLog()`). Never reads via UI.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK (inferred — not shown in lib, only INSERT used) |
| company_id | UUID | YES | — | |
| action | TEXT | NOT NULL | — | e.g. 'create', 'update', 'activate', 'deactivate', 'tally_export' |
| table_name | TEXT | NOT NULL | — | |
| record_id | UUID | YES | — | |
| old_data | JSONB | YES | — | |
| new_data | JSONB | YES | — | |
| created_at | TIMESTAMPTZ | YES | now() | |

**Note:** `auditLog.js` writes to `registry.audit_log` but the DDL for `registry.audit_log` is not present in any migration file in this repo (the `002_registry_schema.sql` does not define it). Uncertain — needs verification against live DB schema.

---

#### `registry.sequence_counters`
**Suite calls `registry.next_cal_sequence()` RPC. Does not directly query this table.**

| Column | Type | Notes |
|---|---|---|
| id | TEXT | PK — `'{company_code}_{prefix}_{year}'` |
| company_id | UUID | FK → registry.companies(id) |
| prefix | TEXT | e.g. 'PO', 'INV', 'GINV' |
| year | INT | Calendar year |
| last_number | INT | NOT NULL DEFAULT 0 |
| updated_at | TIMESTAMPTZ | |

**RLS:** Not set in migrations reviewed — uncertain. Needs verification.

---

### 1.3 Tables in `suite` schema (primary DB)

#### `suite.products`
**Suite READS + WRITES (full CRUD).**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| company_id | UUID | NOT NULL | — | FK → registry.companies(id) |
| name | TEXT | NOT NULL | — | |
| description | TEXT | YES | — | |
| hsn_code | TEXT | YES | — | |
| default_unit | TEXT | YES | `'KG'` | **NOTE: field is `default_unit`, NOT `unit`** |
| default_price | NUMERIC(15,2) | YES | — | |
| currency | TEXT | YES | `'INR'` | |
| is_active | BOOLEAN | YES | TRUE | |
| created_by | UUID | YES | — | FK → auth.users(id) |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

**UNIQUE:** `(company_id, name)`

**RLS policy `company_isolation`:**
```sql
USING (registry.has_company_access(company_id))
WITH CHECK (registry.has_company_access(company_id))
```

---

#### `suite.delivery_addresses`
**Suite READS + WRITES (full CRUD).**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| company_id | UUID | NOT NULL | — | FK → registry.companies(id) |
| label | TEXT | NOT NULL | — | e.g. 'Panavally Plant' |
| address_line1 | TEXT | NOT NULL | — | |
| address_line2 | TEXT | YES | — | |
| city, state | TEXT | YES | — | |
| pincode | TEXT | YES | — | **NOTE: field is `pincode`, NOT `postal_code`** |
| country | TEXT | YES | `'India'` | |
| is_default | BOOLEAN | YES | FALSE | |
| is_active | BOOLEAN | YES | TRUE | |
| created_by | UUID | YES | — | FK → auth.users(id) |
| created_at | TIMESTAMPTZ | YES | now() | |

**UNIQUE:** `(company_id, label)`

**RLS policy `company_isolation`:** same as `suite.products`.

---

#### `suite.purchase_orders`
**Suite READS + WRITES (full CRUD). Status transitions via `updatePurchaseOrderStatus()`.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| company_id | UUID | NOT NULL | — | FK → registry.companies(id) |
| po_number | TEXT | NOT NULL | — | From `registry.next_cal_sequence()` format: `RHHF/PO/2026/0001` |
| po_date | DATE | NOT NULL | CURRENT_DATE | |
| required_date | DATE | YES | — | |
| currency | TEXT | NOT NULL | `'INR'` | |
| status | TEXT | NOT NULL | `'draft'` | CHECK IN ('draft','submitted','pending_approval','approved','sent','partial','fulfilled','rejected','cancelled') |
| priority | TEXT | YES | `'Normal'` | |
| reference_doc | TEXT | YES | — | |
| department | TEXT | YES | — | |
| notes | TEXT | YES | — | |
| vendor_entity_id | UUID | YES | — | FK → registry.entities(id) — live reference |
| vendor_name | TEXT | YES | — | Snapshot at PO creation |
| vendor_address | TEXT | YES | — | Snapshot |
| vendor_gstin | TEXT | YES | — | Snapshot |
| vendor_contact | TEXT | YES | — | Snapshot |
| vendor_phone | TEXT | YES | — | Snapshot |
| vendor_email | TEXT | YES | — | Snapshot |
| vendor_bank_details | TEXT | YES | — | Snapshot |
| delivery_address_id | UUID | YES | — | FK → suite.delivery_addresses(id) |
| delivery_address_text | TEXT | YES | — | Snapshot or free-text override |
| delivery_date | DATE | YES | — | |
| incoterm | TEXT | YES | — | |
| freight_responsibility | TEXT | YES | — | |
| transport_mode | TEXT | YES | — | |
| packing_instructions | TEXT | YES | — | |
| delivery_instructions | TEXT | YES | — | |
| subtotal | NUMERIC(15,2) | YES | 0 | |
| discount_percent | NUMERIC(15,2) | YES | 0 | |
| discount_amount | NUMERIC(15,2) | YES | 0 | |
| tax_rate | NUMERIC(15,2) | YES | 0 | |
| tax_amount | NUMERIC(15,2) | YES | 0 | |
| freight_other | NUMERIC(15,2) | YES | 0 | |
| total | NUMERIC(15,2) | YES | 0 | |
| payment_terms | TEXT | YES | — | |
| terms_conditions | TEXT | YES | — | |
| authorised_by | TEXT | YES | `'Motty Philip'` | |
| internal_remarks | TEXT | YES | — | |
| created_by | UUID | YES | — | FK → auth.users(id) |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

**UNIQUE:** `(company_id, po_number)`

**RLS policy `company_isolation`:** same as `suite.products`.

---

#### `suite.po_line_items`
**Suite READS + WRITES. Replaced wholesale on PO update (DELETE all + re-INSERT).**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| po_id | UUID | NOT NULL | — | FK → suite.purchase_orders(id) ON DELETE CASCADE |
| line_number | INT | NOT NULL | — | |
| product_id | UUID | YES | — | FK → suite.products(id) — nullable; free-text allowed |
| description | TEXT | YES | — | |
| hsn_code | TEXT | YES | — | |
| quantity | NUMERIC(15,3) | YES | 0 | |
| unit | TEXT | YES | `'KG'` | |
| unit_price | NUMERIC(15,2) | YES | 0 | |
| discount_percent | NUMERIC(5,2) | YES | 0 | |
| amount | NUMERIC(15,2) | YES | 0 | |
| created_at | TIMESTAMPTZ | YES | now() | |

**RLS policy `via_purchase_order`:**
```sql
USING (po_id IN (
  SELECT id FROM suite.purchase_orders WHERE registry.has_company_access(company_id)
))
WITH CHECK (same)
```

---

#### `suite.invoices`
**Suite READS + WRITES (full CRUD). Used for all doc_type values including `'gst_lease'`.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| company_id | UUID | NOT NULL | — | FK → registry.companies(id) |
| doc_type | TEXT | NOT NULL | `'proforma'` | CHECK IN ('proforma','commercial','tax_invoice','credit_note'). **Note:** `gstInvoices.js` inserts `doc_type='gst_lease'` — this value is NOT in the CHECK constraint in migration `003`. Uncertain whether constraint was amended post-migration or is currently violated. |
| invoice_number | TEXT | NOT NULL | — | |
| invoice_date | DATE | NOT NULL | CURRENT_DATE | |
| expiry_date | DATE | YES | — | |
| currency | TEXT | NOT NULL | `'USD'` | |
| status | TEXT | NOT NULL | `'draft'` | CHECK IN ('draft','sent','accepted','paid','cancelled') |
| buyer_entity_id | UUID | YES | — | FK → registry.entities(id) — live reference |
| bill_to_company | TEXT | YES | — | Snapshot |
| bill_to_address | TEXT | YES | — | Snapshot |
| bill_to_gstin | TEXT | YES | — | Snapshot |
| bill_to_contact | TEXT | YES | — | Snapshot |
| bill_to_phone | TEXT | YES | — | Snapshot |
| bill_to_email | TEXT | YES | — | Snapshot |
| ship_to_company | TEXT | YES | — | |
| ship_to_address | TEXT | YES | — | |
| notify_party | TEXT | YES | — | |
| freight_type | TEXT | YES | — | |
| incoterm | TEXT | YES | — | |
| port_of_loading | TEXT | YES | — | |
| port_of_discharge | TEXT | YES | — | |
| ship_date | DATE | YES | — | |
| delivery_date | DATE | YES | — | |
| vessel | TEXT | YES | — | |
| bl_number | TEXT | YES | — | |
| gross_weight | TEXT | YES | — | |
| net_weight | TEXT | YES | — | |
| cubic_volume | TEXT | YES | — | |
| total_packages | TEXT | YES | — | |
| marks | TEXT | YES | — | |
| country_of_origin | TEXT | YES | — | |
| final_destination | TEXT | YES | — | |
| subtotal | NUMERIC(15,2) | YES | 0 | |
| tax_rate | NUMERIC(15,2) | YES | 0 | |
| tax_amount | NUMERIC(15,2) | YES | 0 | |
| freight_other | NUMERIC(15,2) | YES | 0 | |
| total | NUMERIC(15,2) | YES | 0 | |
| customer_ref | TEXT | YES | — | |
| reason_export | TEXT | YES | — | |
| lc_number | TEXT | YES | — | |
| lc_date | DATE | YES | — | |
| hs_code | TEXT | YES | — | |
| coo_number | TEXT | YES | — | |
| phyto_number | TEXT | YES | — | |
| payment_terms | TEXT | YES | — | |
| terms_conditions | TEXT | YES | — | |
| bank_details | TEXT | YES | — | |
| declaration | TEXT | YES | — | |
| customs_remarks | TEXT | YES | — | |
| created_by | UUID | YES | — | FK → auth.users(id) |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

**UNIQUE:** `(company_id, invoice_number)`

**RLS policy `company_isolation`:** same as `suite.products`.

---

#### `suite.invoice_line_items`
**Suite READS + WRITES. Replaced wholesale on invoice update.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| invoice_id | UUID | NOT NULL | — | FK → suite.invoices(id) ON DELETE CASCADE |
| line_number | INT | NOT NULL | — | |
| product_id | UUID | YES | — | FK → suite.products(id) — nullable |
| description | TEXT | YES | — | |
| hsn_code | TEXT | YES | — | |
| quantity | NUMERIC(15,3) | YES | 0 | |
| unit | TEXT | YES | `'KG'` | |
| rate | NUMERIC(15,2) | YES | 0 | |
| amount | NUMERIC(15,2) | YES | 0 | |
| created_at | TIMESTAMPTZ | YES | now() | |

**RLS policy `via_invoice`:**
```sql
USING (invoice_id IN (
  SELECT id FROM suite.invoices WHERE registry.has_company_access(company_id)
))
WITH CHECK (same)
```

---

#### `suite.invoice_packing_lines`
**Suite READS + WRITES. Replaced wholesale on invoice update.**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| invoice_id | UUID | NOT NULL | — | FK → suite.invoices(id) ON DELETE CASCADE |
| line_number | INT | NOT NULL | — | |
| marks_desc | TEXT | YES | — | |
| packages | INT | YES | 0 | |
| package_type | TEXT | YES | — | |
| gross_weight | NUMERIC(10,3) | YES | 0 | |
| net_weight | NUMERIC(10,3) | YES | 0 | |
| dimensions | TEXT | YES | — | |
| created_at | TIMESTAMPTZ | YES | now() | |

**RLS policy `via_invoice_packing`:** same pattern as `via_invoice`.

---

#### `suite.shell_stock`
**Suite READS + WRITES (full CRUD including DELETE).**

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | UUID | NOT NULL | gen_random_uuid() | PK |
| company_id | UUID | NOT NULL | — | FK → registry.companies(id). Always RHHF UUID. |
| entry_date | DATE | NOT NULL | CURRENT_DATE | |
| entry_type | TEXT | NOT NULL | — | CHECK IN ('receipt','consumption','sale','adjustment') |
| direction | TEXT | NOT NULL | — | CHECK IN ('in','out') |
| quantity_kg | NUMERIC(15,3) | NOT NULL | — | CHECK (quantity_kg > 0) |
| ref_batch | TEXT | YES | — | ClamFlow lot reference (for receipts) |
| ref_invoice | TEXT | YES | — | CalciWorks sale invoice (for sales) |
| remarks | TEXT | YES | — | |
| created_by | UUID | YES | — | FK → auth.users(id) |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

**RLS policy `shell_stock_company_members`:**
```sql
FOR ALL USING (
  company_id IN (
    SELECT company_id FROM registry.company_users WHERE user_id = auth.uid()
  ) OR registry.is_super_admin()
)
```

---

#### `suite.tally_config`
**Suite READS + WRITES (upsert on `company_id` conflict). No explicit DDL in any migration file in this repo.**

Columns inferred from query and usage patterns in `tallyConfig.js` and `tallyXml.js`:

| Column | Notes |
|---|---|
| company_id | FK → registry.companies(id). Used as upsert conflict key. |
| tally_company_name | Required for XML generation |
| cash_ledger | Used in `getCreditLedger()` |
| upi_ledger | Used in `getCreditLedger()` |
| bank_ledger | Used in `getCreditLedger()` |
| tally_server_url | Optional. Used by "Push to Tally" button (via `api/tally-proxy.js`). |

**Note:** No `CREATE TABLE suite.tally_config` found in any `.sql` file in this repo. Table exists in production DB — DDL either predates migration tracking or was applied directly. **Needs verification against live DB schema.**

**RLS:** Uncertain — not set in any migration file reviewed.

---

#### `suite.tally_exports`
**Suite READS + WRITES (INSERT on export, UPDATE to mark synced). No explicit DDL in any migration file in this repo.**

Columns inferred from `tallyExports.js` and `TallyExport.jsx`:

| Column | Notes |
|---|---|
| id | PK |
| company_id | FK → registry.companies(id) |
| voucher_id | UUID — references Approvals DB voucher (cross-system reference, not a DB FK) |
| voucher_serial | TEXT — serial number from Approvals |
| voucher_amount | NUMERIC |
| voucher_date | TIMESTAMPTZ |
| payee_name | TEXT |
| payment_mode | TEXT |
| export_type | TEXT — e.g. 'payment_voucher' |
| xml_payload | TEXT — full XML saved per export record |
| batch_id | UUID — groups records exported together |
| export_status | TEXT — values observed: 'exported', 're-exported' |
| exported_by | UUID — FK → auth.users(id) |
| exported_at | TIMESTAMPTZ |

**Note:** No `CREATE TABLE suite.tally_exports` found in any `.sql` file in this repo. **Needs verification against live DB schema.**

**RLS:** Uncertain.

---

#### `suite.kpi_snapshots`
**Defined in schema. Suite does NOT currently read or write this table from any lib or page component.** No queries found in `src/`.

**RLS policy `company_isolation`:** applies.

---

#### `suite.activity_feed`
**Defined in schema. Suite does NOT currently read or write this table from any lib or page component.** No queries found in `src/`.

**RLS policy `company_isolation`:** applies.

---

#### `suite.audit_log`
**Defined in schema (migration 003). Suite does NOT currently query this table.** `auditLog.js` writes to `registry.audit_log`, not `suite.audit_log`. The `suite.audit_log` table appears to be defined in the migration but is unused by the application code.

---

### 1.4 Tables in external `ewbguvwrejdvlhzcqlbp` (Approvals DB) — READ ONLY

Suite reads two tables via `supabaseApprovalsReadOnly` (no schema prefix — this DB uses `public` schema):

#### `public.vouchers` (Approvals)
Columns queried in `fetchApprovedVouchers()`:
`id, company_id, serial_number, head_of_account, sub_head_of_account, narration, amount, payment_mode, status, approved_at, completed_at, created_at, narration_items, invoice_reference`

Filtered to: `status IN ('approved', 'completed')`, mapped to company via `APPROVALS_COMPANY_MAP`.

#### `public.payees` (Approvals)
Joined in the same query: `id, name, mobile, bank_account`

**No writes of any kind to this database.**

---

### 1.5 Tables in external `idwgenbkguejgwtzbicu` (ClamFlow DB) — READ ONLY

Suite reads via `supabaseClamFlow` (no schema prefix — `public` schema). All queries use explicit safe column lists from `SAFE_COLUMNS` in `supabaseClamFlow.js` — never `select('*')`.

Tables read:
- `suppliers` — safe columns: id, person_record_id, supplier_type, bank fields, pan_number, gst_number, payment_terms, is_active, created_at, updated_at
- `person_records` — safe columns: id, full_name, person_type, phone, email, address fields, is_active, aadhaar_verified, face_enrolled, onboarding_status, created_at, updated_at
- `user_profiles` — safe columns: id, full_name, role, phone, email, is_active, created_at, updated_at
- `onboarding_pending` — safe columns: id, person_record_id, status, system_account_created, rfid_assigned, started_at, completed_at, created_at, updated_at
- `lots` — safe columns: id, lot_number, supplier_id, species, origin, weight_kg, arrival_date, station_entry_time, current_station_id, status, notes, created_at, updated_at

**No writes of any kind to this database.**

---

## 2. API / Data Access Layer

### `src/lib/supabase.js`
- Exports: `supabase` (Supabase JS client), `ISSUE_ADDRESS` (static object from env vars)
- No DB queries — client initialisation only
- Reads: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ISSUE_ADDRESS_LINE1`, `VITE_ISSUE_ADDRESS_LINE2`, `VITE_ISSUE_ADDRESS_COUNTRY`

---

### `src/lib/supabaseApprovals.js`
- Exports: `supabaseApprovalsReadOnly` (Supabase JS client)
- No DB queries — client initialisation only
- Reads: `VITE_APPROVALS_SUPABASE_URL`, `VITE_APPROVALS_SUPABASE_ANON_KEY`

---

### `src/lib/supabaseClamFlow.js`
- Exports: `supabaseClamFlow` (Supabase JS client), `SAFE_COLUMNS` (object of safe column strings), `maskAadhaar` (function)
- Reads: `VITE_CLAMFLOW_SUPABASE_URL`, `VITE_CLAMFLOW_SUPABASE_ANON_KEY`

---

### `src/lib/permissions.js`
- Exports: `getPermissions(role: string) → object`
- No DB queries — pure JS role→permission mapping
- `role` values accepted: `'super_admin'`, `'admin'`, `'accounts'`, `'auditor'`, `'hr'`, `'operations'`, `'viewer'`, any unknown string (returns all-false)

---

### `src/lib/numberToWords.js`
- Exports: `amtWordsIndian(amount)`, `amtWordsIntl(amount)` (exact export names uncertain — needs verification)
- No DB queries — pure number formatting utility

---

### `src/lib/companies.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchCompanies` | `() → Company[]` | registry.companies | SELECT — filter `is_active=true`, order `short_name` |
| `fetchCompany` | `(companyId) → Company` | registry.companies | SELECT single |
| `updateCompany` | `(companyId, updates) → void` | registry.companies | UPDATE |

---

### `src/lib/profiles.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchProfiles` | `() → Profile[]` | registry.profiles | SELECT — all profiles, order `full_name` |
| `fetchProfile` | `(userId) → Profile` | registry.profiles | SELECT single |
| `updateProfile` | `(userId, {full_name?, email?, mobile?, is_active?}) → void` | registry.profiles | UPDATE — only these 4 fields |
| `fetchUserCompanies` | `(userId) → CompanyUser[]` | registry.company_users | SELECT with company join |
| `assignUserCompany` | `(userId, companyId, role='viewer') → void` | registry.company_users | INSERT |
| `removeUserCompany` | `(companyUserId) → void` | registry.company_users | DELETE |
| `inviteUser` | `(email) → data` | — | `supabase.auth.admin.inviteUserByEmail(email)` — Supabase Admin API |

---

### `src/lib/vendors.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchVendors` | `(companyId) → EntityRole[]` | registry.entity_roles (with nested registry.entities) | SELECT — filter role='Vendor', is_active=true |
| `fetchVendor` | `(entityId) → Entity` | registry.entities | SELECT single |
| `createVendor` | `(companyId, vendorData) → {entity, role}` | registry.entities, registry.entity_roles | INSERT into both |
| `updateVendor` | `(entityId, updates) → void` | registry.entities | UPDATE — subset of fields only |
| `toggleVendorActive` | `(entityRoleId, isActive) → void` | registry.entity_roles | UPDATE `is_active` |

**Note:** `createVendor` always sets `type='ORGANISATION'` and `source_app='suite'`. Maps old `vendorData.phone` → `entities.mobile`, `vendorData.postal_code` → `entities.pincode`, `vendorData.bank_details` → `entities.bank_name`.

---

### `src/lib/buyers.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchBuyers` | `(companyId) → EntityRole[]` | registry.entity_roles (with nested registry.entities) | SELECT — filter role='Customer', is_active=true |
| `fetchBuyer` | `(entityId) → Entity` | registry.entities | SELECT single |
| `createBuyer` | `(companyId, buyerData) → {entity, role}` | registry.entities, registry.entity_roles | INSERT into both |
| `updateBuyer` | `(entityId, updates) → void` | registry.entities | UPDATE |
| `toggleBuyerActive` | `(entityRoleId, isActive) → void` | registry.entity_roles | UPDATE `is_active` |

---

### `src/lib/entities.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchEntities` | `(companyId, {search?, activeOnly?}) → EntityRole[]` | registry.entity_roles (with nested registry.entities) | SELECT — all roles for company |
| `createEntity` | `(companyId, data, userId) → {entity, role}` | registry.entities, registry.entity_roles | INSERT into both |
| `updateEntity` | `(entityId, roleId, data) → void` | registry.entities, registry.entity_roles | UPDATE both |
| `toggleEntityActive` | `(roleId, isActive) → void` | registry.entity_roles | UPDATE `is_active` |
| `searchDuplicateEntity` | `({gstin?, mobile?, display_name?}) → Entity[]` | registry.entities | SELECT — dedup check (GSTIN → mobile → name priority) |
| `addRoleToEntity` | `(entityId, companyId, data) → {id}` | registry.entity_roles | INSERT |
| `fetchEntityRoles` | `(entityId, companyId) → EntityRole[]` | registry.entity_roles | SELECT — all roles for one entity+company pair |

Exports constant: `ENTITY_ROLES = ['Vendor','Customer','Staff','Management','Auditor','Government','Contractor','Supplier','Fisher']`

---

### `src/lib/products.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchProducts` | `(companyId, {search?, activeOnly?}) → Product[]` | suite.products | SELECT |
| `fetchProduct` | `(productId) → Product` | suite.products | SELECT single |
| `createProduct` | `(product) → void` | suite.products | INSERT |
| `updateProduct` | `(productId, updates) → void` | suite.products | UPDATE |
| `toggleProductActive` | `(productId, isActive) → void` | suite.products | UPDATE (delegates to updateProduct) |

---

### `src/lib/deliveryAddresses.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchDeliveryAddresses` | `(companyId) → Address[]` | suite.delivery_addresses | SELECT — filter `is_active=true` |
| `fetchDeliveryAddress` | `(addressId) → Address` | suite.delivery_addresses | SELECT single |
| `createDeliveryAddress` | `(address) → void` | suite.delivery_addresses | INSERT |
| `updateDeliveryAddress` | `(addressId, updates) → void` | suite.delivery_addresses | UPDATE |
| `toggleDeliveryAddressActive` | `(addressId, isActive) → void` | suite.delivery_addresses | UPDATE (delegates to updateDeliveryAddress) |

---

### `src/lib/purchaseOrders.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchPurchaseOrders` | `(companyId, {status?, search?, limit?, offset?}) → {data, count}` | suite.purchase_orders | SELECT paginated |
| `fetchPurchaseOrder` | `(poId) → PO+lineItems+vendorEntity` | suite.purchase_orders, suite.po_line_items, registry.entities | SELECT — 3 separate calls, merged in JS |
| `createPurchaseOrder` | `(po, lineItems, company) → PO` | registry.sequence_counters (via RPC), suite.purchase_orders, suite.po_line_items | RPC + 2× INSERT |
| `updatePurchaseOrder` | `(poId, updates, lineItems?) → PO` | suite.purchase_orders, suite.po_line_items | UPDATE + DELETE all lines + re-INSERT |
| `updatePurchaseOrderStatus` | `(poId, status) → void` | suite.purchase_orders | UPDATE status only |
| `calcLineAmount` | `(qty, price, discount?) → number` | — | Pure calculation |
| `calcPOTotals` | `(lineItems, {overallDiscount?, taxRate?, extraCharges?}) → totals` | — | Pure calculation |

---

### `src/lib/invoices.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchInvoices` | `(companyId, {status?, invoiceType?, search?, limit?, offset?}) → {data, count}` | suite.invoices | SELECT paginated, filter by `doc_type` |
| `fetchInvoice` | `(invoiceId) → Invoice+lines+packing+buyerEntity` | suite.invoices, suite.invoice_line_items, suite.invoice_packing_lines, registry.entities | SELECT — 4 separate calls merged in JS |
| `createInvoice` | `(invoice, lineItems, packingLines, company) → Invoice` | registry.sequence_counters (via RPC), suite.invoices, suite.invoice_line_items, suite.invoice_packing_lines | RPC + up to 3× INSERT |
| `updateInvoice` | `(invoiceId, updates, lineItems?, packingLines?) → Invoice` | suite.invoices, suite.invoice_line_items, suite.invoice_packing_lines | UPDATE + DELETE-all-re-INSERT for each child table |
| `updateInvoiceStatus` | `(invoiceId, status) → void` | suite.invoices | UPDATE status only |
| `calcInvoiceLineAmount` | `(qty, rate) → number` | — | Pure calculation |
| `calcInvoiceTotals` | `(lineItems, {taxRate?, extraCharges?}) → totals` | — | Pure calculation |

---

### `src/lib/gstInvoices.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchGSTInvoices` | `(companyId, {limit?, offset?}) → {data, count}` | suite.invoices | SELECT — filter `doc_type='gst_lease'` |
| `fetchGSTInvoice` | `(invoiceId) → Invoice+lineItems` | suite.invoices, suite.invoice_line_items | SELECT 2 tables |
| `createGSTInvoice` | `(invoice, lineItems, company) → Invoice` | registry.sequence_counters (via RPC with `p_year=9999`), suite.invoices, suite.invoice_line_items | RPC + 2× INSERT |
| `updateGSTInvoice` | `(invoiceId, updates, lineItems?) → Invoice` | suite.invoices, suite.invoice_line_items | UPDATE + DELETE-re-INSERT |

**Note:** GST invoice number format is `INV036` (not the full `RFPL/INV/9999/0036`). The code extracts the numeric part from the RPC result and reformats it.

---

### `src/lib/shellStock.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchShellStock` | `(companyId, {limit?, offset?}) → {data, count}` | suite.shell_stock | SELECT paginated |
| `createShellEntry` | `(entry) → id` | suite.shell_stock | INSERT |
| `updateShellEntry` | `(id, updates) → void` | suite.shell_stock | UPDATE (always sets `updated_at`) |
| `deleteShellEntry` | `(id) → void` | suite.shell_stock | DELETE |
| `directionFor` | `(entryType, explicitDirection?) → 'in'|'out'` | — | Pure utility |

---

### `src/lib/auditLog.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `writeAuditLog` | `({companyId, action, tableName, recordId, oldData?, newData?}) → void` | registry.audit_log | INSERT. Errors are swallowed with `console.error` only — never throws. |
| `fetchAuditLog` | `(companyId, {tableName?, limit?, offset?}) → {data, count}` | registry.audit_log | SELECT paginated |

**Note:** `fetchAuditLog` is defined but no page component currently calls it. It is dead code in the UI.

---

### `src/lib/tallyConfig.js`

| Function | Signature | Tables | Operation |
|---|---|---|---|
| `fetchTallyConfig` | `(companyId) → config\|null` | suite.tally_config | SELECT single — returns null if no row (PGRST116 swallowed) |
| `upsertTallyConfig` | `(config) → void` | suite.tally_config | UPSERT on conflict `company_id` |

---

### `src/lib/tallyExports.js`

| Function | Signature | Tables / External | Operation |
|---|---|---|---|
| `fetchApprovedVouchers` | `(companyId, {from?, to?, limit?}) → Voucher[]` | **Approvals DB**: `public.vouchers` joined `public.payees` | SELECT — READ ONLY. Maps Suite `company_id` to Approvals company ID via hardcoded `APPROVALS_COMPANY_MAP`. |
| `fetchExportedVoucherIds` | `(companyId) → {[voucherId]: exportedAt}` | suite.tally_exports | SELECT — filter `export_status IN ('exported', 're-exported')` |
| `fetchTallyExports` | `(companyId, {limit?, offset?}) → {data, count}` | suite.tally_exports | SELECT paginated |
| `createBatchExport` | `(records[]) → data` | suite.tally_exports | INSERT multiple rows |
| `createTallyExport` | `(exportRecord) → void` | suite.tally_exports | INSERT single row |
| `updateTallyExport` | `(exportId, updates) → void` | suite.tally_exports | UPDATE |

**Hardcoded company ID mapping (in `tallyExports.js`):**
```javascript
const APPROVALS_COMPANY_MAP = {
  'b8beb440-df7f-48e8-a012-ac5750502eca': 'relish-hhc',   // RHHF
  'bc455c94-0bcd-4d66-a040-d29ed880d22f': 'relish-foods',  // RFPL
};
```

---

### `src/lib/tallyXml.js`
No DB calls. Pure XML generation functions:
- `generateTallyXml(vouchers[], config) → xmlString` — builds Tally Prime import XML
- `downloadXmlFile(xmlString, companyShort) → filename` — creates browser download
- `formatTallyDate(dateStr) → string` — formats date as `YYYYMMDD`
- `getCreditLedger(paymentMode, config) → string`
- `buildNarration(voucher) → string`

---

### `src/lib/clamflow.js`

All functions read from ClamFlow DB. No writes. All use `SAFE_COLUMNS` constants — never `select('*')`.

| Function | ClamFlow Table | Notes |
|---|---|---|
| `fetchClamFlowSuppliers({search?, activeOnly?})` | `suppliers`, `person_records` | JOIN via `person_record_id` |
| `fetchClamFlowSupplier(supplierId)` | `suppliers`, `person_records` | Single record |
| `fetchOnboardingStatus(personRecordId)` | `onboarding_pending` | Most recent row |
| `fetchSupplierLots(supplierId, {limit?})` | `lots` | Last N lots |
| `fetchSupplierLotSummary(supplierId)` | `lots` | Count + total kg |
| `fetchClamFlowStaff({search?})` | `person_records` | Filter `person_type='staff'`, `is_active=true` |
| `fetchClamFlowUserProfiles()` | `user_profiles` | Filter `is_active=true` |

Re-exports `maskAadhaar` from `supabaseClamFlow.js`.

---

### `api/tally-proxy.js` (Vercel Serverless Function)
- **Route:** `POST /api/tally-proxy`
- **Purpose:** Proxies XML payload to a Tally Prime HTTP server. Bypasses browser CORS restriction.
- **Auth:** None — no Supabase auth check on this endpoint. Any caller with the Vercel URL can POST to it.
- **Reads no env vars.** The `tallyUrl` is provided in the request body.
- **SSRF mitigations present:** Validates URL scheme (http/https only), blocks private/localhost IP ranges, limits payload to 2 MB, 30-second timeout.
- **No AWS, 2Factor, or other external service credentials.**

---

## 3. Routes / Pages

Router file: `src/App.jsx`

| Path | Component | Role Gate | Loads on Mount | Can Mutate |
|---|---|---|---|---|
| `/` | `Landing` | None (public) | Nothing | Nothing |
| `/login` | `Login` | None (public) | Nothing | `supabase.auth.signInWithPassword` |
| `/dashboard` | `Dashboard` | `ProtectedRoute` (any authenticated, any role) | Nothing (static links only, filtered by role) | Nothing |
| `/purchase-orders` | `PurchaseOrders` | `ProtectedRoute` (any role) | `fetchPurchaseOrders(company_id)` | Status updates via `updatePurchaseOrderStatus()` |
| `/purchase-orders/new` | `PurchaseOrderForm` | roles `['super_admin','admin','operations']` | Vendors list, products list, delivery addresses | `createPurchaseOrder()` |
| `/purchase-orders/:id/edit` | `PurchaseOrderForm` | roles `['super_admin','admin','operations']` | `fetchPurchaseOrder(id)`, vendors, products, addresses | `updatePurchaseOrder()`, `updatePurchaseOrderStatus()` |
| `/invoices` | `Invoices` | `ProtectedRoute` (any role) | `fetchInvoices(company_id)` | Status updates via `updateInvoiceStatus()` |
| `/invoices/new` | `InvoiceForm` | roles `['super_admin','admin','operations']` | Buyers list, products list | `createInvoice()` |
| `/invoices/:id/edit` | `InvoiceForm` | roles `['super_admin','admin','operations']` | `fetchInvoice(id)`, buyers, products | `updateInvoice()`, `updateInvoiceStatus()` |
| `/gst-invoices` | `GSTInvoices` | `ProtectedRoute` (any role) | `fetchGSTInvoices(company_id)` | Nothing from list view |
| `/gst-invoices/new` | `GSTInvoiceForm` | roles `['super_admin','admin','operations']` | Nothing notable | `createGSTInvoice()` |
| `/gst-invoices/:id/edit` | `GSTInvoiceForm` | roles `['super_admin','admin','operations']` | `fetchGSTInvoice(id)` | `updateGSTInvoice()` |
| `/calciworks` | `CalciWorks` | roles `['super_admin','admin','operations']` | `fetchShellStock(company_id)` | `createShellEntry()`, `updateShellEntry()`, `deleteShellEntry()` |
| `/tally-export` | `TallyExport` | roles `['super_admin','admin','accounts']` | `fetchApprovedVouchers()`, `fetchExportedVoucherIds()`, `fetchTallyConfig()` | `createBatchExport()`, `updateTallyExport()`, XML download, push via `api/tally-proxy` |
| `/master-data` | `MasterData` | `ProtectedRoute` (any role, but tabs filtered by permissions) | Tab-dependent (see below) | Tab-dependent |
| `/admin/users` | `UserManagement` | roles `['super_admin']` | `fetchProfiles()`, `fetchCompanies()` | `updateProfile()`, `assignUserCompany()`, `removeUserCompany()`, `inviteUser()` |
| `/settings` | `Settings` | `ProtectedRoute` (any role) | Nothing (data from AuthContext) | `updateProfile()` (full_name only), `signOut()` |
| `*` | `NotFound` | None | Nothing | Nothing |

**`ProtectedRoute` implementation** (`src/components/common/ProtectedRoute.jsx`):
```jsx
if (!user) return <Navigate to="/login" replace />;
if (!profile || !profile.is_active) return <Navigate to="/login" replace />;
if (roles && roles.length > 0 && !roles.includes(activeRole)) return <Navigate to="/dashboard" replace />;
if (requireCompany && companies.length === 0) return <div>No Company Access</div>;
```

**MasterData tab access rules** (within `/master-data`):
- `companies` tab: visible and editable only when `activeRole === 'super_admin'`
- `vendors`, `buyers`, `products`, `delivery`, `entities` tabs: editable when `permissions.canManageMasterData`
- `tally` tab: editable when `permissions.canExportTally`
- `clamflow`, `personnel` tabs: visible only when `permissions.canViewClamFlow`

**MasterData tab data loading:**
- `companies` → `fetchCompanies()`
- `vendors` → `fetchVendors(company_id)`
- `buyers` → `fetchBuyers(company_id)`
- `products` → `fetchProducts(company_id, {search, activeOnly})`
- `delivery` → `fetchDeliveryAddresses(company_id)`
- `entities` → `fetchEntities(company_id, {search, activeOnly})`
- `tally` → `fetchTallyConfig(company_id)`
- `clamflow` → `fetchClamFlowSuppliers({search})`
- `personnel` → `fetchClamFlowStaff({search})`

---

## 4. Auth & Permissions

### 4.1 Login Mechanism

`src/pages/Login.jsx` calls:
```javascript
await signIn(email, password)
// which calls:
supabase.auth.signInWithPassword({ email, password })
```

After successful sign-in, `AuthContext.jsx` (`fetchUserData`) runs in this exact order:
1. Check `registry.app_access WHERE user_id = userId AND app = 'suite'` — if `can_access = false`, call `supabase.auth.signOut()` and stop.
2. Fetch `registry.profiles WHERE id = userId` — if `is_active = false`, call `supabase.auth.signOut()` and stop.
3. Fetch `registry.company_users WHERE user_id = userId` (no join — separate call).
4. Fetch `registry.companies WHERE id IN (company_ids from step 3)` — separate call.
5. Merge, filter to active companies, set `activeCompany` from: localStorage `relish_active_company` → primary company_users row → first in list.

Session persisted via Supabase's default `localStorage` strategy (`persistSession: true`, `autoRefreshToken: true`).

### 4.2 Role Derivation

```javascript
// in AuthContext.jsx:
const activeRole = useMemo(() => {
  if (!profile) return null;
  if (profile.is_super_admin) return 'super_admin';   // synthetic — not in company_users
  const activeCu = companyUsers.find((cu) => cu.company_id === activeCompany?.id);
  return activeCu?.role ?? null;
}, [profile, companyUsers, activeCompany]);
```

**Valid `company_users.role` values** (from migration DDL CHECK constraint):
`'admin'`, `'accounts'`, `'auditor'`, `'hr'`, `'operations'`, `'viewer'`

**`'super_admin'` is synthetic** — derived from `profiles.is_super_admin = TRUE`. It never appears in `company_users.role`.

### 4.3 Permission Map

Full mapping from `src/lib/permissions.js` (reproduced exactly):

| Permission | super_admin | admin | accounts | auditor | hr | operations | viewer | unknown |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| canViewDashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| canCreatePO | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| canApprovePO | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| canCreateInvoice | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| canViewReports | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| canPostVouchers | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| canApprovePayments | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| canManageUsers | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| canManageMasterData | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| canExportTally | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| canViewClamFlow | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| canManageOnboarding | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| canManageHR | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |

**Note on `accounts` vs RELISH_PLATFORM_MASTER.md discrepancy:** The master doc table shows `accounts` having `canApprovePO = ✅` and `canManageMasterData = ✅`. The actual `permissions.js` file sets both to `false` for `accounts`. The code file is the source of truth here.

---

## 5. External Service Credentials

All `VITE_`-prefixed variables are **client-bundled** — visible to anyone with browser dev tools.

| Variable | Prefix type | Where read | Used for |
|---|---|---|---|
| `VITE_SUPABASE_URL` | VITE_ — **client-exposed** | `src/lib/supabase.js:9` | Primary Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | VITE_ — **client-exposed** | `src/lib/supabase.js:10` | Supabase anon key (scoped by RLS) |
| `VITE_APPROVALS_SUPABASE_URL` | VITE_ — **client-exposed** | `src/lib/supabaseApprovals.js:10` | Approvals DB URL (READ ONLY) |
| `VITE_APPROVALS_SUPABASE_ANON_KEY` | VITE_ — **client-exposed** | `src/lib/supabaseApprovals.js:11` | Approvals DB anon key |
| `VITE_CLAMFLOW_SUPABASE_URL` | VITE_ — **client-exposed** | `src/lib/supabaseClamFlow.js:8` | ClamFlow DB URL (READ ONLY) |
| `VITE_CLAMFLOW_SUPABASE_ANON_KEY` | VITE_ — **client-exposed** | `src/lib/supabaseClamFlow.js:9` | ClamFlow DB anon key |
| `VITE_ISSUE_ADDRESS_LINE1` | VITE_ — **client-exposed** | `src/lib/supabase.js:30` | Address line 1 for PO/invoice header |
| `VITE_ISSUE_ADDRESS_LINE2` | VITE_ — **client-exposed** | `src/lib/supabase.js:31` | Address line 2 for PO/invoice header |
| `VITE_ISSUE_ADDRESS_COUNTRY` | VITE_ — **client-exposed** | `src/lib/supabase.js:32` | Country for PO/invoice header |

**No server-side-only env vars are currently read by any file in this repo.** The `api/tally-proxy.js` Vercel function reads no env vars — all parameters come from the request body. The `RELISH_PLATFORM_MASTER.md` references `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for a planned Phase 2.5 `api/enroll-face.ts` Vercel function, but that file does not exist in the current codebase.

---

## 6. Known Gaps / TODOs / Incomplete Features

### 6.1 TODO / FIXME / HACK Comments
**None found.** `grep -rn "TODO|FIXME|HACK" src/` returned no results.

---

### 6.2 Partially Built or Broken Features

**`suite.invoices.doc_type` constraint mismatch:**  
`gstInvoices.js` inserts `doc_type='gst_lease'` but the DDL in `003_suite_schema.sql` defines the CHECK constraint as `CHECK (doc_type IN ('proforma','commercial','tax_invoice','credit_note'))` — `'gst_lease'` is not included. Either the constraint was amended after migration (not recorded in any `.sql` file in this repo) or this insert violates the constraint. The GST invoice feature appears to work in production, suggesting the constraint was amended directly in the DB. **Needs verification.**

**`api/tally-proxy.js` CORS header is overly permissive:**  
`res.setHeader('Access-Control-Allow-Origin', '*')` and no authentication check — any origin can POST XML payloads to this endpoint. The SSRF mitigations block private IPs, but there is no bearer token or Supabase JWT verification on the endpoint itself.

**`fetchAuditLog()` in `auditLog.js` is defined but never called:**  
The function exists and queries `registry.audit_log` but no page component imports or calls it. Dead code.

**`suite.kpi_snapshots` and `suite.activity_feed` are defined in schema but unused:**  
No `src/` code reads or writes these tables. The Dashboard page (`Dashboard.jsx`) shows static navigation tiles — it does not display KPI data.

**`suite.audit_log` table is defined in migration but not written to:**  
`auditLog.js` writes to `registry.audit_log`. `suite.audit_log` defined in `003_suite_schema.sql` receives no writes from application code.

**`suite.tally_config` and `suite.tally_exports` — no DDL in repo:**  
Both tables are used by the application and exist in production but `CREATE TABLE` statements for them are absent from all migration files in this repo. The full column list for `tally_config` is uncertain — only `tally_company_name`, `cash_ledger`, `upi_ledger`, `bank_ledger`, `tally_server_url`, and `company_id` are confirmed from code usage.

**`registry.app_access` check in AuthContext may silently pass when table has no row:**  
`AuthContext.jsx` uses `.maybeSingle()` — if no row exists for this user+app pair, `accessRow` is `null`, and the check `accessRow && accessRow.can_access === false` passes (no forced signout). This means users without an explicit `app_access` row get through. Intentional or oversight — needs verification.

**Personnel tab shows ClamFlow data, not `registry.entities`:**  
`MasterData.jsx` loads the `personnel` tab by calling `fetchClamFlowStaff()` — which reads `person_records` from the external ClamFlow DB. The `RELISH_PLATFORM_MASTER.md` states "Personnel tab is owned by Suite" and should source from `registry.entities WHERE authorized_locations ∋ 'panavally_plant'`, but the actual code still reads from ClamFlow. No entities with `authorized_locations` set exist yet (Phase 2.5 not built).

**No company selector / switcher in the current routing:**  
There is no `/select-company` route in `App.jsx` (referenced in RELISH_PLATFORM_MASTER.md). Company switching is handled via the `setActiveCompany()` function in AuthContext — a company selector component exists in the layout but no dedicated route. This is not broken — just different from the documentation.

**`inviteUser()` in `profiles.js` calls `supabase.auth.admin.inviteUserByEmail()`:**  
The Supabase JS client `supabase.auth.admin` methods require a service role key, not an anon key. The anon key used in `src/lib/supabase.js` does not have admin privileges. This call will fail in production unless the client is configured with a service role key (which it is not, per the env vars). **Uncertain — needs verification against live behaviour.**

**`canManageMasterData` for `accounts` role:**  
The `accounts` role has `canManageMasterData: false` in the code (confirmed in `permissions.js`). This means users with the `accounts` role cannot edit vendors, buyers, products, delivery addresses, or entities from the Master Data tab. The `RELISH_PLATFORM_MASTER.md` permissions table lists `canManageMasterData` as false for `accounts` (not ✅), which is consistent — but note the earlier section "Fields per entity type" implies accounts can create entities.

**`accounts` role cannot access PO/invoice forms:**  
Router gates `purchase-orders/new`, `invoices/new` etc. to `['super_admin','admin','operations']`. The `accounts` role is excluded. The `permissions.js` file gives `accounts` `canCreatePO: true` and `canCreateInvoice: true`, but the router roles array does not include `'accounts'`. This is a discrepancy between the permission map and the route guard. Result: `accounts` users see `canCreatePO = true` from permissions but are redirected to `/dashboard` when navigating to `/purchase-orders/new`. **Needs verification of intent.**
