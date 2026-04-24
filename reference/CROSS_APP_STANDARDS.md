# Relish Ecosystem — Cross-App Standards

> Document Date: April 24, 2026  
> Status: **Proposed** — for review before implementation  
> Scope: Business Suite · Relish Approvals · ClamFlow  
> **READ-ONLY reference — no changes to be made to any app until explicitly instructed.**

---

## Table of Contents

1. [App Inventory](#1-app-inventory)
2. [Current Login Methods — Comparison](#2-current-login-methods--comparison)
3. [Username Naming Convention](#3-username-naming-convention)
4. [Cross-App Role Mapping](#4-cross-app-role-mapping)
5. [Cross-App Parameter Standards](#5-cross-app-parameter-standards)
6. [Proposed Unified Login Standard](#6-proposed-unified-login-standard)
7. [Proposed Unified Username/Email Standard](#7-proposed-unified-usernameemail-standard)
8. [Implementation Priority & Notes](#8-implementation-priority--notes)

---

## 1. App Inventory

| App | URL | Tech | Supabase Project |
|---|---|---|---|
| **Business Suite** | relish-suite.vercel.app | React 18 + Vite + Supabase Auth | `mmkbknnzgpvsqgnynrbe` |
| **Relish Approvals** | relishvoucher.vercel.app | Node.js + Express + Vanilla JS | `ewbguvwrejdvlhzcqlbp` |
| **ClamFlow** | clamflowcloud.vercel.app | React + Node.js | `idwgenbkguejgwtzbicu` |

---

## 2. Current Login Methods — Comparison

| Parameter | Business Suite | Relish Approvals | ClamFlow |
|---|---|---|---|
| **Login identifier** | Email address | Mobile number | Username (e.g. `SA_Motty`) |
| **Credential** | Password (Supabase Auth) | OTP via 2Factor.in | Password (bcrypt `password_hash`) |
| **Session type** | JWT (Supabase, auto-refresh) | Custom OTP session (`otp_sessions` table) | Custom session (server-side) |
| **Session persistence** | Yes — browser localStorage | Temporary OTP window | Yes — `last_login` tracked |
| **MFA** | Not currently enabled | OTP *is* the auth (single factor) | None |
| **Account lock** | Inactive flag (`is_active`) | Not documented | `account_locked_until` + `failed_login_attempts` |
| **Password reset** | Supabase email link | N/A (OTP-only) | `password_reset_required` flag |
| **User store** | `profiles` (Suite DB) | `users` (Approvals DB) | `user_profiles` (ClamFlow DB) |

### Problems with the current state

1. **Three separate identities** — A user (e.g. Motty) has `motty.philip@gmail.com` in Business Suite, a mobile number in Approvals, and `SA_Motty` / `AD_Motty` in ClamFlow.
2. **No single off-switch** — Disabling a departed employee requires edits in three separate systems.
3. **Inconsistent account lock policy** — ClamFlow has brute-force protection; the other two do not.
4. **OTP dependency** — Relish Approvals depends on 2Factor.in (external paid service, failure = no login).
5. **Username inconsistency in ClamFlow** — Prefix casing is mixed (see Section 3).

---

## 3. Username Naming Convention

### 3.1 Current ClamFlow Usernames — Audit

| Username | Role | Station | Prefix Case | Issue |
|---|---|---|---|---|
| `SA_Motty` | Super Admin | System | UPPERCASE | ✓ Correct |
| `AD_Motty` | Admin | Main Office | UPPERCASE | ✓ Correct |
| `PL_Joseph` | Production Lead | Main Office | UPPERCASE | ✓ Correct |
| `PS_Robin` | Production Staff | Main Office | UPPERCASE | ✓ Correct |
| `SL_Balachandran` | Staff Lead | ClamFlow Unit | UPPERCASE | ✓ Correct |
| `qa_karthik` | QC Lead | Main Office | lowercase | ✗ Inconsistent |
| `qc_rani` | QC Staff | ClamFlow Unit | lowercase | ✗ Inconsistent |
| `sg_thomas` | Security Guard | ClamFlow Unit | lowercase | ✗ Inconsistent |

**3 of 8 usernames violate the majority convention.** Additionally, `qa_` (Quality Assurance?) and `qc_` (Quality Control?) overlap in meaning — both refer to quality roles, leading to ambiguity.

### 3.2 Proposed Standard: `{ROLE_CODE}_{PascalCaseFirstName}`

**Rules:**
- Role code: **2–3 characters, all UPPERCASE**
- Separator: **underscore `_`**
- First name: **PascalCase** (first letter uppercase, rest lowercase)
- No spaces, no special characters

### 3.3 Standardized Role Codes for ClamFlow

| Role | Current Code(s) | Proposed Code | Rationale |
|---|---|---|---|
| Super Admin | `SA_` | **`SA_`** | No change — already correct |
| Admin | `AD_` | **`AD_`** | No change — already correct |
| Production Lead | `PL_` | **`PL_`** | No change — already correct |
| Production Staff | `PS_` | **`PS_`** | No change — already correct |
| Staff Lead | `SL_` | **`SL_`** | No change — already correct |
| QC Lead | `qa_` | **`QL_`** | Fix case + use `QL` (QC Lead) for clarity |
| QC Staff | `qc_` | **`QS_`** | Fix case + use `QS` (QC Staff) to distinguish from Lead |
| Security Guard | `sg_` | **`SG_`** | Fix case only |

### 3.4 Corrected Usernames (Proposed)

| Current Username | Proposed Username | Change |
|---|---|---|
| `SA_Motty` | `SA_Motty` | No change |
| `AD_Motty` | `AD_Motty` | No change |
| `PL_Joseph` | `PL_Joseph` | No change |
| `PS_Robin` | `PS_Robin` | No change |
| `SL_Balachandran` | `SL_Balachandran` | No change |
| `qa_karthik` | `QL_Karthik` | Fix prefix case + PascalCase name |
| `qc_rani` | `QS_Rani` | Fix prefix case + PascalCase name |
| `sg_thomas` | `SG_Thomas` | Fix prefix case + PascalCase name |

> **Note:** Username changes in ClamFlow require updating the `username` column in the `user_profiles` table **and** informing the affected users of their new login username. Do NOT implement until confirmed.

---

## 4. Cross-App Role Mapping

This table maps equivalent roles across the three apps. A "unified role" label is proposed for future reference.

| Unified Role | Business Suite | Relish Approvals | ClamFlow | Description |
|---|---|---|---|---|
| **Platform Super Admin** | `super_admin` | `is_super_admin: true` | `Super Admin` (SA_) | Full access to all apps and settings |
| **Company Admin** | `admin` | `admin` | `Admin` (AD_) | Manages company-level operations |
| **Finance / Accounts** | `accounts` | `accounts` | *(no equivalent)* | Voucher approval, Tally export |
| **Operations / Production Lead** | `operations` | *(no equivalent)* | `Production Lead` (PL_) | Day-to-day production oversight |
| **Operations / Production Staff** | `operations` | *(no equivalent)* | `Production Staff` (PS_) | Operational tasks |
| **Line Supervisor** | *(no equivalent)* | *(no equivalent)* | `Staff Lead` (SL_) | ClamFlow-specific supervisory role |
| **Quality Lead** | *(no equivalent)* | *(no equivalent)* | `QC Lead` (QL_) | ClamFlow-specific QC management |
| **Quality Staff** | *(no equivalent)* | *(no equivalent)* | `QC Staff` (QS_) | ClamFlow-specific QC tasks |
| **Security / Viewer** | `viewer` | *(no equivalent)* | `Security Guard` (SG_) | Read/limited access |

### Observations

- **Business Suite `operations`** maps broadly to both `Production Lead` and `Production Staff` in ClamFlow — these may need to be split in the Suite if granularity is needed.
- **Relish Approvals** has only two roles (`accounts`, `admin`). It is the simplest role model.
- **ClamFlow** has the most granular role model (8 roles) — driven by plant floor realities.
- When unified auth is implemented, the `app_roles` table should preserve each app's native role — roles are **not** collapsed into a single value.

---

## 5. Cross-App Parameter Standards

These are the field names and conventions that should be consistent across all three apps:

### 5.1 User Record Fields

| Parameter | Business Suite | Relish Approvals | ClamFlow | Proposed Standard Name |
|---|---|---|---|---|
| User UUID | `profiles.id` | `users.id` | `user_profiles.id` | `id` (UUID, primary key) |
| Display name | `profiles.full_name` | `users.full_name` | `user_profiles.full_name` | `full_name` ✓ — already consistent |
| Email | `profiles.email` | `users.email` | `user_profiles.email` | `email` ✓ — consistent (ClamFlow has it but often null) |
| Phone/Mobile | *(not stored)* | `users.mobile` | `user_profiles.contact_number` | Standardize to `mobile` |
| Role | `profiles.role` (TEXT) | `users.role` + `is_super_admin` | `user_profiles.role` (TEXT) | `role` (TEXT) ✓ |
| Active flag | `profiles.is_active` | *(per-company active)* | `user_profiles.is_active` | `is_active` (BOOLEAN) |
| Last login | *(not tracked)* | *(not tracked)* | `user_profiles.last_login` | Add `last_login` to all |
| Failed logins | *(not tracked)* | *(not tracked)* | `user_profiles.failed_login_attempts` | Add to all (security) |
| Account lock | *(not tracked)* | *(not tracked)* | `user_profiles.account_locked_until` | Add to all (security) |
| Created at | `profiles.created_at` | `users.created_at` | `user_profiles.created_at` | `created_at` ✓ — consistent |
| Updated at | `profiles.updated_at` | `users.updated_at` | `user_profiles.updated_at` | `updated_at` ✓ — consistent |

### 5.2 Company Record Fields

| Parameter | Business Suite | Relish Approvals | ClamFlow |
|---|---|---|---|
| Company ID | `rhhf`, `rfpl` | `relish-hhc`, `relish-foods` | *(not a multi-company app)* |
| Company name | `companies.name` | `companies.name` | *(single plant)* |
| Active flag | `companies.is_active` | *(not documented)* | N/A |

> The company ID mismatch between Business Suite and Approvals is the only existing cross-app mapping that requires a translation layer (`APPROVALS_COMPANY_MAP` in `src/lib/tallyExports.js`). Under unified auth this mapping must be preserved.

### 5.3 Session & Security Parameters

| Parameter | Proposed Standard | Notes |
|---|---|---|
| **Session duration** | 24 hours (access token), 7 days (refresh token) | Supabase defaults; configure in Supabase Dashboard |
| **Account lock threshold** | 5 failed attempts | ClamFlow already implements this |
| **Lock duration** | 30 minutes | After 5 failures |
| **Password minimum length** | 10 characters | Apply to all apps |
| **Password complexity** | At least 1 uppercase, 1 number, 1 special character | Apply to all apps |
| **Idle session timeout** | 8 hours | Enforce on all frontends |
| **Password reset** | Email link (Supabase) | Standardize — eliminates `password_reset_required` manual flag |

---

## 6. Proposed Unified Login Standard

When unified auth is implemented (see `RELISH_BUSINESS_SUITE_OVERVIEW.md` Section 5), the login standard across all three apps becomes:

| Parameter | Standard |
|---|---|
| **Login identifier** | Email address |
| **Credential** | Password (minimum 10 chars, complexity enforced) |
| **Auth provider** | Supabase Auth (Suite DB project — `mmkbknnzgpvsqgnynrbe`) |
| **Session token** | Supabase JWT (access + refresh) |
| **MFA (optional)** | Supabase TOTP (authenticator app) — recommended for Admin+ roles |
| **Account lock** | Supabase Auth + custom enforcement via `profiles` |
| **Password reset** | Supabase email reset link |

**What changes per app:**

| App | Change Required |
|---|---|
| Business Suite | No change to login UI — already on this standard |
| Relish Approvals | Replace OTP/mobile flow with email+password (Supabase JWT validation on Node backend) |
| ClamFlow | Replace `username`+`password_hash` flow with email+password (Supabase JWT validation) |

---

## 7. Proposed Unified Username/Email Standard

Since ClamFlow currently has no email for most users, a company email format is needed for migration.

### 7.1 Company Email Domain

Proposed: **`@relishfoods.in`** (or whichever domain is active)  
> Confirm with Motty Philip before creating any accounts.

### 7.2 Email Format

```
{first_name}.{last_name}@relishfoods.in
```

Examples:
- Motty Philip → `motty.philip@relishfoods.in`
- Balachandran M N → `balachandran.mn@relishfoods.in`
- Karthik (single name) → `karthik@relishfoods.in`

For users who already have personal emails on record (e.g. `motty.philip@gmail.com`), their personal email can be used, or they can be migrated to the company email — user's choice.

### 7.3 ClamFlow Username Retention

Under unified auth, ClamFlow users log in via email. However, **the `username` field in `user_profiles` should be retained** — it is used for display and identification on the plant floor (e.g., on RFID assignments, lot records). It is **not** the login credential post-migration.

The corrected usernames from Section 3.4 should be applied at the same time as the auth migration.

---

## 8. Implementation Priority & Notes

These changes are **staged** — nothing is implemented until explicitly approved.

| Stage | Task | Affects | Pre-requisite |
|---|---|---|---|
| **0 (Now)** | Fix ClamFlow username casing (`qa_→QL_`, `qc_→QS_`, `sg_→SG_`) | ClamFlow `user_profiles` | Inform affected users first |
| **1** | Add `app_roles` table to Suite DB | Business Suite DB only | None |
| **2** | Migrate ClamFlow `user_profiles` → Supabase `auth.users` | Suite DB + ClamFlow | Stage 1 complete |
| **3** | Migrate Approvals `users` → Supabase `auth.users` | Suite DB + Approvals | Stage 1 complete |
| **4** | Update ClamFlow backend to validate Supabase JWTs | ClamFlow codebase | Stage 2 complete |
| **5** | Update Approvals backend to validate Supabase JWTs | Approvals codebase | Stage 3 complete |
| **6** | Extend Business Suite User Management to manage all app roles | Business Suite | Stages 4+5 complete |
| **7** | Decommission 2Factor.in OTP + ClamFlow `password_hash` auth | Approvals + ClamFlow | Stage 6 complete |

> **Strict rule:** Stages 4 and 5 require writing to Approvals and ClamFlow codebases. These will NOT be touched until explicitly instructed per stage.

---

*End of document.*
