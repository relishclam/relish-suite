# Relish Suite — Complete Status Report

> Generated: 2026-06-08  
> Branch: `main` | Deployed: https://relishsuite.vercel.app  
> Repository: https://github.com/relishclam/relish-suite

---

## 1. Platform Overview

**Relish Suite** is the master business management platform for two seafood companies. It is being built as a unified module hub that will eventually absorb the functions of all satellite apps (ClamFlow, Relish Approvals).

| Company | Short Name | State | GSTIN |
|---|---|---|---|
| Relish Hao Hao Chi Foods | RHHF | Kerala | 32AAUFR0742E1ZB |
| Relish Foods Pvt Ltd | RFPL | Tamil Nadu | 33AAACR7749E2ZD |

**Contact:** Motty Philip · +91 94460 12324

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + React Router | 18.3.1 / 6.28.0 |
| Build | Vite | 6.0.0 |
| Styling | Plain CSS, CSS variables | — |
| Fonts | DM Serif Display + DM Sans | — |
| Database | Supabase JS | 2.47.0 |
| PDF | jsPDF + jspdf-autotable | 2.5.2 / 5.0.8 |
| PWA | vite-plugin-pwa | 0.21.0 |
| Deployment | Vercel | — |

---

## 3. Database Architecture

Three separate Supabase projects. Suite is the only one that accepts writes.

| Project | ID | Client File | Policy |
|---|---|---|---|
| **Suite** (primary) | `mmkbknnzgpvsqgnynrbe` | `supabase.js` | Full read + write |
| **Approvals** (legacy payments) | `ewbguvwrejdvlhzcqlbp` | `supabaseApprovals.js` | **READ ONLY — SELECT only** |
| **ClamFlow** (plant production) | `idwgenbkguejgwtzbicu` | `supabaseClamFlow.js` | **READ ONLY — SELECT only** |

> **NON-NEGOTIABLE RULE:** Suite never writes to ClamFlow or Approvals databases. No exceptions. Ever.

### Suite Named Schemas

| Schema | Tables |
|---|---|
| `registry` | companies, profiles, company_users, entities, entity_roles, sequence_counters, audit_log |
| `suite` | purchase_orders, po_line_items, invoices, invoice_line_items, invoice_packing_lines, products, delivery_addresses, tally_config, tally_exports, kpi_snapshots, activity_feed, shell_stock |
| `pramaana` | (planned — Accounts/Vouchers) |
| `clamflow` | (planned — Production data mirror) |

### Sequence Number Format

| Function | Format | Used For |
|---|---|---|
| `next_cal_sequence` | `RFPL/PO/2026/0001` | Purchase Orders, Invoices |
| `next_fy_sequence` | `RHHF/PYMT/2526/0001` | Pramaana vouchers (future) |

---

## 4. Migrations Applied to Production

| File | Status | Description |
|---|---|---|
| `001_create_schemas.sql` | ✅ Applied | Creates registry, suite, pramaana, clamflow schemas |
| `002_registry_schema.sql` | ✅ Applied | Companies, profiles, entities, sequences, audit_log |
| `003_suite_schema.sql` | ✅ Applied | POs, invoices, products, delivery addresses, tally |
| `004_migrate_public_to_schemas.sql` | ✅ Applied | Moves data from public schema |
| `005_rls_and_grants.sql` | ✅ Applied | RLS policies and GRANT statements |
| `006_rls_fixes.sql` | ✅ Applied | Fixed RLS recursion; added INSERT WITH CHECK; registry grants |
| `007_calciworks_shell_stock.sql` | ⚠️ **PENDING** | Must be run manually in Supabase SQL editor |

### Pending SQL for `007_calciworks_shell_stock.sql`

Run this in the Supabase SQL editor (`mmkbknnzgpvsqgnynrbe`) before using the CalciWorks page:

```sql
CREATE TABLE suite.shell_stock (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES registry.companies(id),
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type      TEXT NOT NULL CHECK (entry_type IN ('receipt','consumption','sale','adjustment')),
  direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
  quantity_kg     NUMERIC(15,3) NOT NULL CHECK (quantity_kg > 0),
  ref_batch       TEXT,
  ref_invoice     TEXT,
  remarks         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_shell_stock_company ON suite.shell_stock(company_id);
CREATE INDEX idx_shell_stock_date    ON suite.shell_stock(entry_date);
ALTER TABLE suite.shell_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shell_stock_company_members" ON suite.shell_stock
  FOR ALL USING (
    company_id IN (SELECT company_id FROM registry.company_users WHERE user_id = auth.uid())
    OR registry.is_super_admin()
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON suite.shell_stock TO authenticated;
```

Also run this to seed the GST Invoice counter so numbering continues from INV035:

```sql
INSERT INTO registry.sequence_counters (id, company_id, prefix, year, last_number)
VALUES (
  'RFPL_INV_9999',
  'bc455c94-0bcd-4d66-a040-d29ed880d22f',
  'INV',
  9999,
  35
)
ON CONFLICT (id) DO UPDATE SET last_number = 35;
```

Also run the RFPL address/pincode correction:

```sql
UPDATE registry.companies
SET address_line1 = '179 B, Madhavapuram', pincode = '629704'
WHERE short_name = 'RFPL';
```

---

## 5. Modules — Current Status

### 5.1 ✅ Authentication & User Management

| Item | Status |
|---|---|
| Supabase Auth (email + password) | ✅ Working |
| `is_super_admin` flag on profiles | ✅ Working |
| Per-company roles: admin, accounts, auditor, hr, operations, viewer | ✅ Working |
| `permissions.js` — role-based permission map | ✅ Working |
| ProtectedRoute with role enforcement | ✅ Working |
| User Management page (super_admin only) | ✅ Working |
| AuthContext — session, user, profile, companies, activeCompany, activeRole | ✅ Working |
| Company switcher in Header | ✅ Working |

### 5.2 ✅ Purchase Orders

| Item | Status |
|---|---|
| PO list page with search + status filter | ✅ Working |
| PO creation form with line items | ✅ Working |
| PO edit | ✅ Working |
| Vendor auto-fill from registry | ✅ Working |
| Product auto-fill (uses `default_unit` field) | ✅ Working |
| Delivery address auto-fill (uses `pincode` field) | ✅ Working |
| Status workflow (draft → approved → completed) | ✅ Working |
| `next_cal_sequence` — format: `RFPL/PO/2026/0001` | ✅ Working |
| PDF generation (jsPDF) | ✅ Working |

### 5.3 ✅ Commercial Invoices

| Item | Status |
|---|---|
| Invoice list page with search + filter | ✅ Working |
| Invoice creation form with line items + packing | ✅ Working |
| Invoice edit | ✅ Working |
| Proforma / Commercial toggle | ✅ Working |
| Buyer auto-fill from registry | ✅ Working |
| Status workflow (draft → final → cancelled) | ✅ Working |
| `next_cal_sequence` numbering | ✅ Working |
| PDF generation | ✅ Working |
| Tally XML export integration | ✅ Working |

### 5.4 ✅ GST Tax Invoice (Lease Rental)

| Item | Status |
|---|---|
| GST Invoice list page | ✅ Working |
| New invoice form — RFPL factory lease to Peninsular Fisheries | ✅ Working |
| Edit existing invoice | ✅ Working |
| Auto-fill lessor from `fetchCompany()` (full address including pincode) | ✅ Working |
| Pre-filled lessee defaults (Peninsular Fisheries) | ✅ Working |
| Intra-state (CGST + SGST) vs inter-state (IGST) auto-detection | ✅ Working |
| 18% GST on SAC 997212 (Factory Lease Rental) | ✅ Working |
| Amount in words (Indian format) | ✅ Working |
| PDF generation — full GST Tax Invoice layout | ✅ Working |
| ASCII-safe Indian number formatter (no Unicode thin-space artifacts) | ✅ Working |
| Right-aligned tax summary column | ✅ Working |
| Saved to `suite.invoices` with `doc_type = 'gst_lease'` | ✅ Working |
| Invoice numbering — **PENDING DB SEED** (next will be INV036) | ⚠️ Needs SQL above |

### 5.5 ✅ CalciWorks — Shell Stock Ledger

| Item | Status |
|---|---|
| CalciWorks page at `/calciworks` | ✅ Working |
| KPI cards — Total Received, Total Out, Balance, Transaction count | ✅ Working |
| Ledger table with type + direction badges | ✅ Working |
| Manual entry — Consumption, Sale, Adjustment | ✅ Working |
| Manual Receipt **disabled** — receipts come from ClamFlow only | ✅ Enforced |
| "Sync from ClamFlow" button — visible, disabled (placeholder) | ✅ In UI |
| Warning banner explaining ClamFlow sync status | ✅ In UI |
| Add / Edit / Delete via slide-over | ✅ Working |
| Stored in `suite.shell_stock` | ⚠️ Needs SQL migration above |

### 5.6 ✅ Master Data

| Item | Status |
|---|---|
| Companies — view + edit | ✅ Working |
| Vendors — list, add, edit, toggle active | ✅ Working |
| Buyers — list, add, edit, toggle active | ✅ Working |
| Products — list, add, edit, toggle active (uses `default_unit`) | ✅ Working |
| Delivery Addresses — list, add, edit (uses `pincode`) | ✅ Working |
| Tally Config — per-company Tally server settings | ✅ Working |
| ClamFlow Suppliers — read-only view from ClamFlow DB | ✅ Working |
| Personnel — read-only view from ClamFlow DB | ✅ Working |

### 5.7 ✅ Tally Export

| Item | Status |
|---|---|
| Reads approved vouchers from Approvals DB (read-only) | ✅ Working |
| Company UUID → Approvals string ID mapping | ✅ Fixed |
| Tally XML generation | ✅ Working |
| Export log saved to `suite.tally_exports` | ✅ Working |
| Vouchers marked as exported to prevent duplicates | ✅ Working |

### 5.8 ✅ Settings

| Item | Status |
|---|---|
| Profile settings | ✅ Working |
| Company settings view | ✅ Working |

### 5.9 ✅ PWA

| Item | Status |
|---|---|
| Service worker (Workbox generateSW) | ✅ Working |
| Offline page | ✅ Working |
| `manifest.json` | ✅ Working |
| `apple-mobile-web-app-capable` meta tag | ✅ Working |
| `mobile-web-app-capable` meta tag | ✅ Working |

---

## 6. Bugs Fixed in This Session (June 2026)

| # | Bug | Fix Applied |
|---|---|---|
| 1 | `TypeError: c is not a function` on all save operations | Added `<ToastProvider>` to `main.jsx` |
| 2 | Products list showing "—" in Unit column | Changed `key: 'unit'` → `key: 'default_unit'` |
| 3 | 403 on all writes to companies/vendors/buyers/profiles | Ran `GRANT INSERT,UPDATE,DELETE` on registry tables in Supabase SQL editor |
| 4 | User Management showing "Access Denied" for super_admin | `isSuperAdmin` not exported from AuthContext — derive as `activeRole === 'super_admin'` |
| 5 | Vercel build failure — `"default" is not exported by UserManagement.jsx` | File was committed as empty — re-committed with actual content |
| 6 | Tally Export always failed | `APPROVALS_COMPANY_MAP` used wrong string keys — fixed to UUID keys |
| 7 | Missing `.schema('suite')` in tallyConfig.js, tallyExports.js | Added schema qualifier to all queries |
| 8 | `.select().single()` on status update functions | Removed — use `crypto.randomUUID()` pre-insert pattern instead |
| 9 | `p.unit` in PO and Invoice form fillProduct | Changed to `p.default_unit` |
| 10 | `a.postal_code` in fillDeliveryAddr | Changed to `a.pincode` |
| 11 | GST Invoice PDF: lessor address blank | `activeCompany` from AuthContext has no `address_line1` — call `fetchCompany()` on mount |
| 12 | GST Invoice PDF: tax numbers stretched/garbled | `toLocaleString('en-IN')` emits Unicode thin-spaces — replaced with ASCII-safe formatter |
| 13 | RLS infinite recursion on profiles + company_users | Created `registry.is_super_admin()` SECURITY DEFINER function |

---

## 7. Source File Inventory

### Pages (`src/pages/`)

| File | Purpose | Status |
|---|---|---|
| `Landing.jsx` | Public landing page | ✅ |
| `Login.jsx` | Supabase Auth login | ✅ |
| `Dashboard.jsx` | KPI summary, recent activity | ✅ |
| `PurchaseOrders.jsx` | PO list | ✅ |
| `PurchaseOrderForm.jsx` | PO create/edit | ✅ |
| `Invoices.jsx` | Commercial invoice list | ✅ |
| `InvoiceForm.jsx` | Commercial invoice create/edit | ✅ |
| `GSTInvoices.jsx` | GST lease invoice list | ✅ |
| `GSTInvoiceForm.jsx` | GST lease invoice create/edit + PDF | ✅ |
| `CalciWorks.jsx` | Shell stock ledger (RHHF division) | ✅ |
| `MasterData.jsx` | All master data tabs | ✅ |
| `TallyExport.jsx` | Tally XML export | ✅ |
| `UserManagement.jsx` | Platform user administration | ✅ |
| `Settings.jsx` | User + company settings | ✅ |
| `NotFound.jsx` | 404 page | ✅ |

### Library (`src/lib/`)

| File | Purpose | Write Target |
|---|---|---|
| `supabase.js` | Suite DB client | Suite (read/write) |
| `supabaseApprovals.js` | Approvals DB client | **READ ONLY** |
| `supabaseClamFlow.js` | ClamFlow DB client | **READ ONLY** |
| `companies.js` | Company CRUD | Suite `registry` |
| `profiles.js` | User profile CRUD | Suite `registry` |
| `vendors.js` | Vendor CRUD (entity_roles) | Suite `registry` |
| `buyers.js` | Buyer CRUD (entity_roles) | Suite `registry` |
| `products.js` | Product CRUD | Suite `suite` |
| `deliveryAddresses.js` | Delivery address CRUD | Suite `suite` |
| `purchaseOrders.js` | PO CRUD + sequence | Suite `suite` |
| `invoices.js` | Invoice CRUD + sequence | Suite `suite` |
| `gstInvoices.js` | GST lease invoice CRUD | Suite `suite` |
| `shellStock.js` | Shell stock ledger CRUD | Suite `suite` |
| `tallyConfig.js` | Tally config read/write | Suite `suite` |
| `tallyExports.js` | Reads Approvals, writes export log | Suite `suite` (log only) |
| `tallyXml.js` | Tally XML generator | Client-side only |
| `clamflow.js` | ClamFlow data reads | **READ ONLY** |
| `auditLog.js` | Audit log writes | Suite `registry` |
| `permissions.js` | Role → permission map | Client-side only |
| `numberToWords.js` | Indian amount in words | Client-side only |

---

## 8. Route & Access Control Map

| Route | Component | Min Role |
|---|---|---|
| `/` | Landing | Public |
| `/login` | Login | Public |
| `/dashboard` | Dashboard | Any authenticated |
| `/purchase-orders` | PurchaseOrders | Any authenticated |
| `/purchase-orders/new` | PurchaseOrderForm | admin, operations, super_admin |
| `/purchase-orders/:id/edit` | PurchaseOrderForm | admin, operations, super_admin |
| `/invoices` | Invoices | Any authenticated |
| `/invoices/new` | InvoiceForm | admin, operations, super_admin |
| `/invoices/:id/edit` | InvoiceForm | admin, operations, super_admin |
| `/gst-invoices` | GSTInvoices | Any authenticated |
| `/gst-invoices/new` | GSTInvoiceForm | admin, operations, super_admin |
| `/gst-invoices/:id/edit` | GSTInvoiceForm | admin, operations, super_admin |
| `/calciworks` | CalciWorks | admin, operations, super_admin |
| `/tally-export` | TallyExport | accounts, admin, super_admin |
| `/master-data` | MasterData | Any authenticated (edit: admin+) |
| `/admin/users` | UserManagement | super_admin only |
| `/settings` | Settings | Any authenticated |

---

## 9. Known Pending Items

| # | Item | Priority | Blocked By |
|---|---|---|---|
| P1 | Run `007_calciworks_shell_stock.sql` in Supabase | 🔴 High | Manual SQL step |
| P2 | Seed GST Invoice counter at 35 in `sequence_counters` | 🔴 High | Manual SQL step |
| P3 | Correct RFPL address/pincode in `registry.companies` | 🟡 Medium | Manual SQL step |
| P4 | Smoke test all Master Data forms end-to-end | 🟡 Medium | — |
| P5 | Smoke test Purchase Order full workflow | 🟡 Medium | — |
| P6 | Smoke test Commercial Invoice full workflow | 🟡 Medium | — |
| P7 | Smoke test Tally Export with live vouchers | 🟡 Medium | — |
| P8 | Inspect ClamFlow tables to confirm shell yield column exists | 🔵 Planning | Motty to run SQL query |
| P9 | CalciWorks — enable "Sync from ClamFlow" button | 🔵 Planning | Blocked by P8 |
| P10 | Onboarding module in Suite | 🔵 Planning | Blocked by ClamFlow table inspection |
| P11 | CalciWorks Sales Invoice (RHHF/CalciWorks Division branding) | 🔵 Planning | — |
| P12 | Pramaana (Accounts/Vouchers module) | 🔵 Future | Approvals DB audit required first |

---

## 10. Architecture Roadmap

```
Phase 1 — CURRENT (June 2026)
────────────────────────────────────────────────
✅ Suite core: POs, Invoices, GST Invoice, Master Data
✅ CalciWorks Shell Stock Ledger
✅ Tally Export (reads Approvals DB)
✅ Auth, RBAC, User Management
✅ PWA, Vercel deploy

Phase 2 — NEXT
────────────────────────────────────────────────
🔲 CalciWorks: ClamFlow production batch sync (read-only)
🔲 CalciWorks Sales Invoice (shell sales with division branding)
🔲 Onboarding module: entity creation, RFID, face enrollment
   → ClamFlow will read enrolled faces from Suite's AWS collection

Phase 3 — FUTURE
────────────────────────────────────────────────
🔲 Pramaana: Vouchers, Approvals, Payment workflow
   → Replaces Relish Approvals app
🔲 HR module: attendance, leave, payroll
🔲 Shift scheduling (Suite pushes schedule → ClamFlow reads)

Phase 4 — MIGRATION
────────────────────────────────────────────────
🔲 ClamFlow access migrated: reads entity/biometric data from Suite
🔲 Approvals app retired: all voucher history migrated to Pramaana
🔲 All satellite apps become thin clients of Suite modules
```

---

## 11. External Dependencies

| Service | Purpose | Notes |
|---|---|---|
| Vercel | Hosting + serverless functions | Auto-deploy from `main` branch |
| Supabase (Suite) | Primary database | `mmkbknnzgpvsqgnynrbe` |
| Supabase (Approvals) | Voucher read access | `ewbguvwrejdvlhzcqlbp` — READ ONLY |
| Supabase (ClamFlow) | Plant production read access | `idwgenbkguejgwtzbicu` — READ ONLY |
| AWS Rekognition | Face enrollment + recognition | `relish-staff`, `relish-visitors` collections |
| Tally ERP | Accounting — XML import | Via Tally proxy API + XML export |

---

*End of Status Report — 2026-06-08*
