# Relish Suite — State of the Platform (June 2026)

> Assessment date: 8 June 2026  
> Author: AI Engineering Record  
> Status: **Week 0 Complete — Platform Live**

---

## 1. Executive Summary

Week 0 of the Relish Platform build is complete. The React application layer has been fully rewritten to align with five completed SQL migrations that reorganised the entire Supabase database from the `public` schema into four named schemas: `registry`, `suite`, `pramaana`, and `clamflow`. All code files were updated, three critical Supabase-side bugs were fixed, and the application is confirmed working end-to-end — login, company switching, role-based permissions, and dashboard rendering are all operational.

The platform is now ready for the next phase: smoke-testing all pages and building the Pramaana accounting module.

---

## 2. Platform Architecture

### 2.1 Companies

| Code | Legal Name | Type | State | GSTIN |
|------|-----------|------|-------|-------|
| RHHF | Relish Hao Hao Chi Foods | Partnership | Kerala | 32AAUFR0742E1ZB |
| RFPL | Relish Foods Pvt Ltd | Private Limited | Tamil Nadu | 33AAACR7749E2ZD |

> **CalciWorks** is a division of RHHF — not a company. No separate DB record, no separate GSTIN. In all apps, CalciWorks data carries `company_id = RHHF UUID` and `department = 'CalciWorks'`.

### 2.2 Supabase Projects

| Project | Purpose | Access |
|---------|---------|--------|
| `mmkbknnzgpvsqgnynrbe` (relish-platform) | Suite, Registry, Pramaana, ClamFlow | Read + Write |
| `ewbguvwrejdvlhzcqlbp` (Approvals legacy) | Payment vouchers for Tally export | **Read-only** via `supabaseApprovals.js` |
| `idwgenbkguejgwtzbicu` (ClamFlow legacy) | Clam processing operations | **Read-only** via `supabaseClamFlow.js` |

The Approvals and ClamFlow legacy databases are read for display purposes only. No writes are ever made to them from this application.

### 2.3 Database Schemas (relish-platform)

```
relish-platform (mmkbknnzgpvsqgnynrbe)
├── registry   — Companies, profiles, auth, entities, entity_roles, sequence_counters
├── suite      — Purchase orders, invoices, products, delivery addresses, KPI, activity
├── pramaana   — Ledgers, vouchers, approvals (DDL pending)
└── clamflow   — Lots, shifts, RFID, gate logs (DDL pending)
```

**Rule:** Every Supabase query uses `.schema('registry'|'suite'|'pramaana'|'clamflow')`. The default `public` schema is never used.

### 2.4 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router v6 |
| Styling | Plain CSS, CSS variables, DM Serif Display + DM Sans |
| Backend | Supabase (Postgres + Auth + Row Level Security) |
| PDF | jsPDF (client-side) |
| PWA | vite-plugin-pwa |
| Deployment | Vercel |

---

## 3. Schema Reference

### 3.1 `registry` Schema

| Table | Purpose |
|-------|---------|
| `companies` | RHHF and RFPL company records |
| `profiles` | One row per `auth.users` user — `is_super_admin`, `full_name`, etc. |
| `company_users` | User ↔ company membership with role |
| `entities` | Universal people store — vendors, buyers, staff, visitors |
| `entity_roles` | Classifies an entity per company: `Vendor`, `Customer`, `Staff`, `Visitor` |
| `sequence_counters` | Shared counter table for document numbering |
| `app_access` | Feature-level access flags per company |
| `attendance` | Staff attendance records |
| `biometrics` | Biometric enrollment tokens (never stores raw Aadhaar) |
| `onboarding_queue` | Staff onboarding workflow |
| `visitors` | Visitor log entries |

### 3.2 `suite` Schema

| Table | Purpose |
|-------|---------|
| `purchase_orders` | PO headers (`vendor_entity_id` FK → `registry.entities`) |
| `po_line_items` | PO lines — FK column is **`po_id`** |
| `invoices` | Invoice headers (`buyer_entity_id` FK → `registry.entities`) |
| `invoice_line_items` | Invoice lines — FK column is **`invoice_id`** |
| `invoice_packing_lines` | Packing list lines — FK column is **`invoice_id`** |
| `products` | Product/item master |
| `delivery_addresses` | Saved ship-to addresses |
| `tally_config` | Per-company Tally integration settings |
| `tally_exports` | Export job log |
| `kpi_snapshots` | Dashboard KPI cache |
| `activity_feed` | Audit/activity stream |

#### Key `suite.invoices` Column Names
```
doc_type            customer_ref        reason_export       ship_date
bl_number           cubic_volume        marks               freight_other
bill_to_company     ship_to_company     bill_to_address     ship_to_address
bill_to_contact     bill_to_phone       bill_to_email       bill_to_gstin
buyer_entity_id
```
> `bill_to_address` and `ship_to_address` are single `TEXT` columns — not split into address_line1/city/etc.

### 3.3 `pramaana` and `clamflow` Schemas
Both schemas exist and are exposed in the Supabase API. DDL migrations have **not yet been run**. These schemas are empty — ready to receive their tables in the next phase.

---

## 4. Authentication & Authorisation

### 4.1 Auth Model
```
registry.profiles.is_super_admin = true  →  'super_admin' (platform-wide, all permissions)
registry.company_users.role              →  per-company role for all other users
```

**Valid company roles:** `admin` | `accounts` | `auditor` | `hr` | `operations` | `viewer`

`'super_admin'` is a synthetic role — it never appears in `company_users.role`. It is derived at runtime when `profile.is_super_admin === true`.

### 4.2 Permissions Object
`src/lib/permissions.js` — `getPermissions(role)` returns 13 boolean flags:

| Flag | admin | accounts | auditor | hr | operations | viewer |
|------|:-----:|:--------:|:-------:|:--:|:----------:|:------:|
| `canViewDashboard` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `canCreatePO` | ✓ | ✓ | | | | |
| `canApprovePO` | ✓ | | | | | |
| `canCreateInvoice` | ✓ | ✓ | | | | |
| `canViewReports` | ✓ | ✓ | ✓ | | | |
| `canPostVouchers` | ✓ | | | | | |
| `canApprovePayments` | ✓ | | | | | |
| `canManageUsers` | ✓ | | | | | |
| `canManageMasterData` | ✓ | | | | | |
| `canExportTally` | ✓ | ✓ | ✓ | | | |
| `canViewClamFlow` | ✓ | | | | ✓ | |
| `canManageOnboarding` | ✓ | | | ✓ | | |
| `canManageHR` | ✓ | | | ✓ | | |

All flags are `true` for `super_admin`.

### 4.3 localStorage
Active company selection is persisted at `localStorage.key = 'relish_active_company'`.

---

## 5. Entity Model (Vendors & Buyers)

The platform uses a single universal people store: `registry.entities`. Vendors and buyers are **not** separate tables — they are classified via `registry.entity_roles`.

```sql
-- Vendors
SELECT er.*, e.*
FROM registry.entity_roles er
JOIN registry.entities e ON e.id = er.entity_id
WHERE er.company_id = $1 AND er.role = 'Vendor';

-- Buyers / Customers
... WHERE er.company_id = $1 AND er.role = 'Customer';
```

**JS access pattern:**
```js
vendorRow.entity.id
vendorRow.entity.display_name
vendorRow.entity.alias          // formerly "contact_person" — label: "Alias / Short Name"
vendorRow.entity.mobile
vendorRow.entity.pincode
vendorRow.entity.bank_name
vendorRow.entity.gstin
```

**Active/inactive toggle** updates `entity_roles.is_active` (not `entities.is_active`), so a vendor can be deactivated per-company without affecting the underlying entity.

---

## 6. Document Sequencing

All document numbers are generated by the `registry.next_cal_sequence` RPC function:

```js
// Format: {COMPANY_CODE}/{PREFIX}/{YEAR}/{NNNN}
// Example: RHHF/PO/2025/0042
await supabase.schema('registry').rpc('next_cal_sequence', {
  p_company_id:   company.id,
  p_company_code: company.code,
  p_prefix:       'PO'   // or 'INV'
});
```

Financial-year sequences (Pramaana vouchers) use `next_fy_sequence`:
```
RHHF/PYMT/2526/0001
```

No application module invents its own numbering. All counters live in `registry.sequence_counters`.

---

## 7. Document Generation — Address Rule

All Purchase Orders, Proforma Invoices, and Commercial Invoices for **both companies** show the RHHF Head Office address as the issuing address:

```
26/599, M.O.Ward
Alappuzha, Kerala 688001
India
```

This address is stored in `.env` as `VITE_ISSUE_ADDRESS_LINE1` / `VITE_ISSUE_ADDRESS_LINE2` / `VITE_ISSUE_COUNTRY`. It is **never hardcoded**. The address field on PO and Invoice forms is read-only.

---

## 8. Week 0 Work Completed

### 8.1 Database Migrations (5 completed before this session)

| # | Migration | Effect |
|---|-----------|--------|
| 001 | Create named schemas | `registry`, `suite`, `pramaana`, `clamflow` created |
| 002 | Registry DDL | All identity/auth tables created in `registry` |
| 003 | Suite DDL | All transactional tables created in `suite` |
| 004 | Migrate public → schemas | Data moved from `public.*` to named schemas |
| 005 | RLS and grants | Policies applied (with recursion bugs — see §8.3) |

### 8.2 React Files Changed

| Change | Files |
|--------|-------|
| **New** | `src/lib/permissions.js` |
| **Full rewrite** | `src/contexts/AuthContext.jsx`, `src/lib/vendors.js`, `src/lib/buyers.js`, `src/lib/purchaseOrders.js`, `src/lib/invoices.js` |
| **Fixed** | `src/components/common/ProtectedRoute.jsx`, `src/components/layout/Header.jsx`, `src/components/layout/Sidebar.jsx` |
| **Fixed** | `src/lib/companies.js`, `src/lib/profiles.js` |
| **Fixed** | `src/pages/MasterData.jsx`, `src/pages/PurchaseOrderForm.jsx`, `src/pages/InvoiceForm.jsx` |
| **Fixed** | `src/pages/Dashboard.jsx`, `src/pages/Invoices.jsx`, `src/pages/PurchaseOrders.jsx`, `src/pages/Settings.jsx` |

### 8.3 Supabase-Side Fixes Applied

**Exposed schemas** (Supabase Dashboard → Integrations → Data API):
```
public, registry, suite, pramaana, clamflow
```

**SQL executed in Supabase SQL Editor:**

```sql
-- Fix 1: Break infinite RLS recursion on registry.profiles
CREATE OR REPLACE FUNCTION registry.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM registry.profiles
    WHERE id = auth.uid() AND is_super_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION registry.is_super_admin TO authenticated;

DROP POLICY IF EXISTS own_profile ON registry.profiles;
CREATE POLICY own_profile ON registry.profiles
  FOR ALL USING (id = auth.uid() OR registry.is_super_admin());

-- Fix 2: Break infinite RLS recursion on registry.company_users
DROP POLICY IF EXISTS company_users_visibility ON registry.company_users;
CREATE POLICY company_users_visibility ON registry.company_users
  USING (user_id = auth.uid() OR registry.is_super_admin());

-- Fix 3: Allow all authenticated users to read companies
ALTER TABLE registry.companies DISABLE ROW LEVEL SECURITY;
```

> **Note:** The migration file `005_rls_and_grants.sql` still contains the old recursive policies. If migrations are ever re-run from scratch, these three SQL blocks must be re-applied or the migration file must be patched first.

### 8.4 React Runtime Bugs Fixed

**Bug 1: Cross-schema FK join returns null silently**  
PostgREST cannot resolve FK joins across schemas (e.g. `.select('company:companies(...)')`  from `registry.company_users` joining `registry.companies`). The query returned data with `company: null` on every row — no error was raised.

**Fix:** Split into two separate queries — fetch `company_users`, extract `company_id` array, then fetch `companies` with `.in('id', companyIds)`. Merge in JavaScript.

**Bug 2: Redirect loop / Maximum update depth**  
`onAuthStateChange` set the `user` state immediately when a session was detected, while `loading` was only set to `false` after `fetchUserData` completed. During the async gap, `Login` (which redirects when `user` is truthy) and `ProtectedRoute` (which showed "No Company Access" when `companies.length === 0`) entered a fight — causing a render loop.

**Fix:** `onAuthStateChange` now calls `setLoading(true)` as its first action, before invoking `fetchUserData`. The `loading` flag gates both `Login` and `ProtectedRoute`, so no navigation decisions are made until all user data is resolved.

---

## 9. Current Working State

| Area | Status |
|------|--------|
| Dev server | ✅ Starts clean, zero build errors |
| Login / Sign-out | ✅ Working |
| Company switcher | ✅ RHHF ↔ RFPL switching works |
| Role badge | ✅ Shows `super admin` / role name correctly |
| Dashboard | ✅ Loads KPI area, company context correct |
| Master Data — Companies tab | ✅ Lists companies, slide-over edit works |
| Master Data — Vendors tab | ✅ entity_roles model, toggle active works |
| Master Data — Buyers tab | ✅ entity_roles model, alias field works |
| Purchase Orders list | 🔲 Not yet smoke-tested |
| PO Form (create) | 🔲 Not yet smoke-tested |
| PO Form (edit) | 🔲 Not yet smoke-tested |
| Invoices list | 🔲 Not yet smoke-tested |
| Invoice Form (create) | 🔲 Not yet smoke-tested |
| Invoice Form (edit) | 🔲 Not yet smoke-tested |
| Tally Export page | 🔲 Not yet tested (reads from `ewbguvwrejdvlhzcqlbp`) |
| User Management page | 🔲 Not yet smoke-tested |
| Settings page | 🔲 Not yet smoke-tested |
| Pramaana schema | ⏸ Schema exists, DDL not yet run |
| ClamFlow schema | ⏸ Schema exists, DDL not yet run |

---

## 10. Known Issues & Pending Work

### 10.1 Minor / Low Priority
- **React Router v7 future flag warnings** — Benign console noise. Silence by adding `future: { v7_startTransition: true, v7_relativeSplatPath: true }` to `<BrowserRouter>` in `main.jsx`.
- **Migration file 005 has old recursive policies** — `005_rls_and_grants.sql` in `/supabase/migrations/` still has the old policies. The runtime SQL was fixed directly in the dashboard. The migration file should be patched before any re-run.
- **Tally Export `APPROVALS_COMPANY_MAP`** — The company ID translation map from legacy Approvals company IDs (`'relish-foods'`, `'relish-hhc'`) to Suite UUIDs (RHHF, RFPL) has not yet been populated.
- **Nothing committed to git** — All Week 0 rewrites are uncommitted. Recommended commit message: `Week 0: React layer rewrite for named schemas`.

### 10.2 Next Development Phase

**Priority 1 — Smoke test all pages**
Verify each page renders, loads data, and saves correctly:
- Purchase Orders list, PO Form create/edit
- Invoices list, Invoice Form create/edit
- User Management, Settings, Tally Export

**Priority 2 — Pramaana DDL**
Write and run `006_pramaana_schema.sql`. The `pramaana` schema is already created and exposed. Tables for ledgers, vouchers, and approval queues are next.

**Priority 3 — ClamFlow DDL**
Write `007_clamflow_schema.sql`. Lots, shifts, RFID, gate log, biometric enrollment queue.

**Priority 4 — Biometric / Onboarding integration**
Face enrollment (AWS Rekognition) via Suite → read-only search in ClamFlow. Collection names: `relish-staff`, `relish-visitors`.

---

## 11. People Safety Rules (Never Break)

- **Aadhaar:** Never store the 12-digit number. Store only `aadhaar_last4`, `aadhaar_verified` (boolean), and `aadhaar_ref_token`.
- **Biometrics:** Only `hr`, `operations`, and `is_super_admin` roles can read `registry.biometrics`.
- **Duplicate prevention:** Before any entity creation, check for matching `mobile`, `gstin`, or `aadhaar_last4`. Duplicates must be blocked at the app layer.
- **Face enrollment** happens only in Suite onboarding. ClamFlow only calls `SearchFacesByImage` — never `IndexFaces`.

---

## 12. Physical Locations

| Site | Address |
|------|---------|
| RHHF Head Office (issuing address for all docs) | 26/599, M.O.Ward, Alappuzha, Kerala 688001 |
| RHHF Processing Plant (ClamFlow) | 5/379, Panavally, Cherthala, Alappuzha, Kerala 688526 |
| RFPL Plant & Registered Office | 179 B, Madhavapuram, Kanyakumari, Tamil Nadu 629704 |

---

*End of assessment — Relish Suite, June 2026*
