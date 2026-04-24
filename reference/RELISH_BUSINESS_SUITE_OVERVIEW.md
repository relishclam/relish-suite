# Relish Business Suite — Current Functionality Overview

> Document Date: April 23, 2026

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Where the Data is Drawn From](#2-where-the-data-is-drawn-from)
3. [How Data is Organized — Database & UI](#3-how-data-is-organized--database--ui)
4. [How Authentication Works](#4-how-authentication-works)
5. [Suggestion: Unified Authentication with Strict RBAC](#5-suggestion-unified-authentication-with-strict-rbac)
6. [Suggestion: ClamFlow & Relish Approvals Shortcuts on the Dashboard](#6-suggestion-clamflow--relish-approvals-shortcuts-on-the-dashboard)

---

## 1. Application Overview

**Relish Business Suite** is a React 18 + Vite Progressive Web App (PWA) deployed on Vercel. It is the central business management hub for two Indian seafood companies:

| Company | Short Name | GSTIN |
|---|---|---|
| Relish Hao Hao Chi Foods | RHHF | 32AAUFR0742E1ZB |
| Relish Foods Pvt Ltd | RFPL | 33AAACR7749E2ZD |

**Tech Stack:**
- React 18 + React Router v6 + Vite
- Plain CSS with CSS variables, DM Serif Display + DM Sans fonts
- Supabase (3 separate project clients)
- jsPDF (client-side PDF generation)
- PWA via `vite-plugin-pwa`
- Deployed to Vercel; API routes via Vercel Serverless Functions (`/api/tally-proxy.js`)

**Pages / Routes:**

| Route | Page | Access |
|---|---|---|
| `/` | Landing | Public |
| `/login` | Login | Public |
| `/dashboard` | Dashboard | Any authenticated user with a company |
| `/purchase-orders` | Purchase Orders List | Any authenticated user |
| `/purchase-orders/new` or `/:id/edit` | PO Form | super_admin, admin, operations |
| `/invoices` | Invoice List | Any authenticated user |
| `/invoices/new` or `/:id/edit` | Invoice Form | super_admin, admin, operations |
| `/tally-export` | Tally Export | super_admin, admin, accounts |
| `/master-data` | Master Data | Any authenticated user (edit: admin+) |
| `/admin/users` | User Management | super_admin only |
| `/settings` | Settings | Any authenticated user |

---

## 2. Where the Data is Drawn From

The app reads from **three separate Supabase databases**. Each has its own client instance, environment variables, and a strict read/write policy.

### 2.1 Suite Database (Primary — Read/Write)

- **Supabase Project ID:** `mmkbknnzgpvsqgnynrbe`
- **Env Vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Client:** `src/lib/supabase.js` → exported as `supabase`
- **Policy:** Full read + write. This is the app's own data store.
- **Owns:** Companies, Users/Profiles, Purchase Orders, Invoices, Vendors, Buyers, Products, Delivery Addresses, Tally Configuration, Tally Exports, Sequence Counters, Audit Log.

### 2.2 Approvals Database (Read-Only)

- **Supabase Project ID:** `ewbguvwrejdvlhzcqlbp`
- **Env Vars:** `VITE_APPROVALS_SUPABASE_URL`, `VITE_APPROVALS_SUPABASE_ANON_KEY`
- **Client:** `src/lib/supabaseApprovals.js` → exported as `supabaseApprovals`
- **Policy:** `.select()` ONLY. Zero writes, zero schema changes.
- **Why it's needed:** The Tally Export feature reads approved and completed payment vouchers from the Relish Approvals app's database, maps them to the correct company, and generates Tally XML.
- **Company ID Mapping:** Suite `rhhf` → Approvals `relish-hhc`; Suite `rfpl` → Approvals `relish-foods`
- **Tables read:** `vouchers`, `payees`

### 2.3 ClamFlow Database (Read-Only)

- **Supabase Project ID:** `idwgenbkguejgwtzbicu`
- **Env Vars:** `VITE_CLAMFLOW_SUPABASE_URL`, `VITE_CLAMFLOW_SUPABASE_ANON_KEY`
- **Client:** `src/lib/supabaseClamFlow.js` → exported as `supabaseClamFlow`
- **Policy:** `.select()` ONLY. Zero writes, zero schema changes.
- **Why it's needed:** The Master Data page surfaces ClamFlow supplier and plant personnel data for the RHHF Panavally Processing Plant. It is hidden from RFPL-only users.
- **Tables read (safe columns only):** `suppliers`, `person_records`, `user_profiles`, `onboarding_pending`, `lots`
- **Sensitive field rules:** `face_embedding`, `face_image_path`, `face_image`, `password_hash` are **never queried**. Aadhaar numbers are masked on display: `XXXX-XXXX-XXXX-{last4}`.

### 2.4 Document Issue Address

All POs, Proforma Invoices, and Commercial Invoices are issued from the RHHF Head Office address:
> 26/599, M.O.Ward, Alappuzha, Kerala 688001, India

This is stored in `.env` as `VITE_ISSUE_ADDRESS_LINE1/LINE2/COUNTRY` and accessed only via the `ISSUE_ADDRESS` constant. It is **never hardcoded** in components and is read-only on all forms.

---

## 3. How Data is Organized — Database & UI

### 3.1 Suite Database Schema (Tables)

| Table | Purpose |
|---|---|
| `companies` | RHHF and RFPL company records (id, name, short_name, gstin, address, is_active) |
| `profiles` | One row per Supabase Auth user (id = auth UUID, email, full_name, role, is_active) |
| `user_companies` | Many-to-many join: which users can access which companies |
| `vendors` | Supplier/vendor master per company |
| `buyers` | Buyer/customer master per company |
| `products` | Product catalogue per company |
| `delivery_addresses` | Delivery address book per company |
| `purchase_orders` | PO header records (po_number, status, company_id, vendor_id, buyer_id, dates, totals) |
| `po_line_items` | Line-item rows belonging to a PO |
| `invoices` | Invoice headers (invoice_number, invoice_type: proforma/commercial, status, company_id, buyer_id) |
| `invoice_line_items` | Line-item rows belonging to an invoice |
| `invoice_packing_lines` | Packing list rows belonging to an invoice |
| `tally_config` | Tally ledger/company name configuration per company |
| `tally_exports` | Export history records (voucher_id UUID, company_id, exported_at, export_status) |
| `sequence_counters` | Auto-incrementing document number sequences per company + document type |
| `audit_log` | Timestamped record of create/update/delete operations across all tables |

**Document Numbering** is handled by the Supabase RPC `next_sequence(p_company_id, p_document_type)`, ensuring gapless, per-company sequences for:
- `purchase_order` → `PO-RHHF-XXXXXX` / `PO-RFPL-XXXXXX`
- `proforma_invoice` → `PF-RHHF-XXXXXX` / `PF-RFPL-XXXXXX`
- `commercial_invoice` → `CI-RHHF-XXXXXX` / `CI-RFPL-XXXXXX`

### 3.2 UI Organization

The UI is built around a persistent **AppLayout** (sidebar + header) with the following main sections:

#### Dashboard
- Role-filtered quick-link cards.
- Shows active company name and welcome message.
- Cards: Purchase Orders, Invoices, Tally Export, Master Data, User Management (super_admin), Settings.

#### Purchase Orders (`/purchase-orders`)
- Paginated list (20 per page) filtered by company, status, and search.
- Status workflow: `draft` → `pending_approval` → `approved` / `rejected`
- PO Form is a multi-step wizard (6 steps from the reference HTML): header, vendor/buyer, line items, totals, delivery, PDF preview.
- PDF generated client-side via jsPDF using Indian number words (Crore/Lakh).

#### Invoices (`/invoices`)
- Paginated list filtered by company, type (proforma / commercial), status, and search.
- Status workflow: `draft` → `sent` → `paid` / `cancelled`
- Invoice Form is a multi-step wizard (7 steps): header, buyer, line items, packing, totals, delivery, PDF preview.
- PDF generated client-side via jsPDF using International number words (Million).

#### Tally Export (`/tally-export`)
- **Export Tab:** Pulls approved/completed payment vouchers from the Approvals DB, cross-references already-exported vouchers from `tally_exports`, and lets the user select a batch to export.
- Filters: payment mode (Cash, UPI, Bank Transfer), date range.
- Generates a Tally-compatible XML file (`generateTallyXml`) for download.
- **History Tab:** Shows all past export batches with drill-down into individual voucher records.
- Can optionally push XML via Tally proxy API (`/api/tally-proxy.js`).
- Access gated to: `super_admin`, `admin`, `accounts`.

#### Master Data (`/master-data`)
- Tabbed interface with 8 tabs (2 are ClamFlow-gated):

| Tab | Data Source | Edit Rights |
|---|---|---|
| Companies | Suite DB `companies` | super_admin only |
| Vendors | Suite DB `vendors` | admin, operations, super_admin |
| Buyers | Suite DB `buyers` | admin, operations, super_admin |
| Products | Suite DB `products` | admin, operations, super_admin |
| Delivery Addresses | Suite DB `delivery_addresses` | admin, operations, super_admin |
| Tally Config | Suite DB `tally_config` | admin, accounts, super_admin |
| ClamFlow Suppliers | ClamFlow DB (read-only) | No edits — view only |
| Personnel | ClamFlow DB (read-only) | No edits — view only |

- ClamFlow tabs are hidden unless the user is `super_admin` or is assigned to the `rhhf` company.
- A slide-over drawer is used for create/edit forms on all editable tabs.
- Supplier detail slide-over shows onboarding status, lot history, and a masked Aadhaar number.

#### User Management (`/admin/users`) — super_admin only
- Lists all profiles with search and active/inactive filter.
- Edit slide-over: update full name, role, active status.
- Company assignment: add/remove company access for each user.
- Invite new users via Supabase Auth email magic link (`inviteUserByEmail`).

#### Settings (`/settings`)
- Users can update their display name.
- Shows email (read-only), assigned role (read-only), and list of accessible companies.
- Sign out button.

---

## 4. How Authentication Works

### 4.1 Mechanism

Authentication uses **Supabase Auth** (`@supabase/supabase-js`) with **email + password** sign-in. Sessions are persisted client-side and auto-refreshed via JWT tokens.

```
User enters email + password
    → supabase.auth.signInWithPassword({ email, password })
    → Supabase returns session (access_token + refresh_token)
    → onAuthStateChange listener fires in AuthContext
    → fetchUserData(userId) runs:
        1. Reads profiles table (role, full_name, is_active)
        2. Reads user_companies → companies (or all companies for super_admin)
    → AuthContext state is populated (session, user, profile, companies, activeCompany)
```

If `profiles.is_active = false`, the user is immediately signed out.

### 4.2 What the User is Indexed To

Every authenticated user is indexed to **two keys**:

| Key | Source | Purpose |
|---|---|---|
| `user.id` (UUID) | Supabase Auth `auth.users` | Primary identity key across all tables |
| `profiles.id` | Suite DB `profiles` table (FK → auth.users.id) | Role, name, active flag |

The `profiles` table is the single source of truth for a user's **role** and **active status** within the Business Suite. The many-to-many `user_companies` join table extends this to **company-level access control**.

### 4.3 Roles and Access Levels

| Role | Description | Capabilities |
|---|---|---|
| `viewer` | Read-only | View POs, Invoices, Master Data |
| `operations` | Day-to-day ops | All viewer rights + create/edit POs and Invoices |
| `accounts` | Finance | All viewer rights + Tally Export + Tally Config |
| `admin` | Company manager | All operations + accounts rights + full Master Data edits |
| `super_admin` | Platform administrator | All rights + User Management + all companies + ClamFlow access |

### 4.4 Company-Level Gating

- Non-`super_admin` users only see data for companies they are assigned to in `user_companies`.
- The active company is selected in the header and persisted to `localStorage` (`relish_active_company`).
- All database queries are scoped to `activeCompany.id`.

### 4.5 ClamFlow Access Gate

ClamFlow tabs in Master Data are only visible when:
```
profile.role === 'super_admin'
OR
companies.some(c => c.id === 'rhhf')
```
This means any user assigned to the RHHF company can see ClamFlow data (regardless of role), but RFPL-only users cannot.

---

## 5. Suggestion: Unified Authentication with Strict RBAC

### 5.1 Current State — The Problem

The three apps currently use **completely separate, incompatible auth systems**:

| App | Auth System | User Store |
|---|---|---|
| **Business Suite** | Supabase Auth (email + password) | `profiles` in Suite DB (`mmkbknnzgpvsqgnynrbe`) |
| **Relish Approvals** | Custom OTP via 2Factor.in (mobile number) | `users` in Approvals DB (`ewbguvwrejdvlhzcqlbp`) |
| **ClamFlow** | Custom auth (password_hash in `user_profiles`) | `user_profiles` in ClamFlow DB (`idwgenbkguejgwtzbicu`) |

A user must maintain **three separate identities** across three systems. There is no single place to disable an employee's access to all apps at once. Role definitions are inconsistent across apps.

### 5.2 Recommended Approach: Supabase Auth as the Central Identity Provider

Use the **Business Suite's Supabase project** (`mmkbknnzgpvsqgnynrbe`) as the canonical identity provider. A single `auth.users` record drives access to all three apps.

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│        Supabase Auth (Suite DB — mmkbknnzgpvsqgnynrbe)  │
│                   auth.users (UUID)                     │
└─────────────────────────────────────────────────────────┘
               │                    │                  │
               ▼                    ▼                  ▼
    ┌──────────────────┐  ┌─────────────────┐  ┌────────────────┐
    │  Business Suite  │  │ Relish Approvals│  │   ClamFlow     │
    │  (React / Vite)  │  │  (Node/Express) │  │  (React/Node)  │
    └──────────────────┘  └─────────────────┘  └────────────────┘
```

#### Unified `profiles` Table (Suite DB)

Add app-specific role columns to the existing `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN approvals_role TEXT;   -- 'accounts' | 'admin' | NULL
ALTER TABLE profiles ADD COLUMN clamflow_role  TEXT;   -- 'operator' | 'supervisor' | 'admin' | NULL
-- Existing: role TEXT  (suite role: viewer/operations/accounts/admin/super_admin)
```

Or alternatively, create a unified `app_roles` table:

```sql
CREATE TABLE app_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  app         TEXT NOT NULL,  -- 'suite' | 'approvals' | 'clamflow'
  role        TEXT NOT NULL,
  company_id  TEXT,           -- NULL = all companies
  is_active   BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, app, company_id)
);
```

This approach is more normalized and scales as more apps are added.

#### How Each App Authenticates

**Business Suite** — No change. Already uses Supabase Auth.

**Relish Approvals** — Replace the current 2Factor.in OTP flow with Supabase Auth. On the Node/Express backend, validate the Supabase JWT from the `Authorization: Bearer <token>` header using the Supabase service key or `@supabase/supabase-js` on the server. Map the `user.id` to the `app_roles` table to determine the user's Approvals role.

**ClamFlow** — Replace `password_hash` auth with Supabase Auth JWT validation. The React/Node frontend sends the Supabase access token; the backend verifies it and looks up the `clamflow_role` from `app_roles`.

#### Benefits

| Benefit | Detail |
|---|---|
| Single identity | One email + password for all apps |
| Instant deactivation | Set `profiles.is_active = false` to cut access to all three apps simultaneously |
| Centralized role management | `super_admin` manages all app roles from the Business Suite User Management page |
| Consistent audit trail | All actions across all apps are attributable to the same `user.id` |
| No more OTP service dependency | Eliminates the 2Factor.in dependency and its cost/failure modes |
| Supabase handles MFA | Supabase Auth supports TOTP (authenticator app) MFA natively |

#### Migration Steps (High Level)

1. Add `app_roles` table (or columns) to Suite DB.
2. Migrate existing Approvals `users` and ClamFlow `user_profiles` into `auth.users` (use Supabase Admin API `createUser`).
3. Populate `app_roles` with each user's existing roles.
4. Update Approvals backend to validate Supabase JWTs instead of OTP sessions.
5. Update ClamFlow backend/frontend to use Supabase client for sign-in.
6. Extend Business Suite User Management page to manage `app_roles` for all three apps.
7. Decommission 2Factor.in OTP flow and `password_hash` in ClamFlow.

> **Important:** Steps 4–5 require changes to the Approvals and ClamFlow codebases. Zero schema changes are needed to the existing Approvals or ClamFlow databases — `app_roles` lives entirely in the Suite DB.

---

## 6. Suggestion: ClamFlow & Relish Approvals Shortcuts on the Dashboard

### 6.1 Your Idea

Add shortcut icon cards on the Business Suite Dashboard that open **ClamFlow** and **Relish Approvals** as external links (new tab), similar to how the existing quick-link cards work today.

### 6.2 Assessment: This is a Good Idea

**Reasons it makes sense:**

- The Dashboard is already the central launch point for all in-app features. Extending it to act as a **unified app launcher** for the entire Relish ecosystem is a natural evolution.
- Operators and accounts staff currently switch between apps by remembering separate URLs. A single dashboard card removes that friction.
- The implementation is trivial — external link cards are a one-line addition to the `QUICK_LINKS` array in `Dashboard.jsx`, rendered differently from internal route links.
- Access can be gated exactly like the existing cards (e.g., ClamFlow card only shown to `super_admin` or RHHF-assigned users, matching the existing `canAccessClamFlow` logic).

**Recommendations for implementation:**

1. Differentiate external link cards visually from internal cards (e.g., a small `↗` icon to indicate "opens in new tab").
2. Store the external URLs in `.env` (`VITE_CLAMFLOW_URL`, `VITE_APPROVALS_URL`) so they are configurable per environment (dev/staging/prod) without code changes.
3. Apply role/company gating consistently:
   - ClamFlow card: visible only to `super_admin` or RHHF-assigned users (mirrors `canAccessClamFlow`).
   - Relish Approvals card: visible to `super_admin`, `admin`, and `accounts` roles.

**Example change to `Dashboard.jsx`:**

```jsx
const EXTERNAL_LINKS = [
  {
    href: import.meta.env.VITE_CLAMFLOW_URL,
    label: 'ClamFlow',
    icon: '🦪',
    desc: 'Processing plant operations',
    roles: null,           // role gate handled by canAccessClamFlow
    requiresClamFlow: true,
  },
  {
    href: import.meta.env.VITE_APPROVALS_URL,
    label: 'Relish Approvals',
    icon: '✅',
    desc: 'Payment voucher approvals',
    roles: ['super_admin', 'admin', 'accounts'],
  },
];
```

Cards render as `<a href={link.href} target="_blank" rel="noopener noreferrer">` instead of a `<button onClick={navigate}>`.

**One caveat:** Until the Unified Auth (Section 5) is implemented, clicking the shortcut will still require the user to sign in separately to each app. After unified auth, the experience becomes seamless if all apps share the same Supabase session cookie/token — the user is already authenticated.

---

*End of document.*
