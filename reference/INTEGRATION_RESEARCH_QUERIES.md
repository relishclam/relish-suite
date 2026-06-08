# Integration Research Queries
## Things to Investigate in ClamFlow & Relish Approvals

> Created: 2026-06-08  
> Purpose: Before the CalciWorks shell stock auto-sync and Pramaana migration can be built,  
> these questions must be answered by inspecting the live/test apps and their databases.

---

## 1. ClamFlow — Shell By-Product Data

ClamFlow is the RHHF Panavally plant production app (currently in **test run, not yet deployed to production**).

### 1.1 Does ClamFlow currently record shell output?

Go to the ClamFlow Supabase project (`idwgenbkguejgwtzbicu`) and check for any of these tables:

| Table name to look for | What it would contain |
|---|---|
| `production_batches` | Processing runs — clam in, meat + shell out |
| `shift_records` / `shift_logs` | Per-shift production totals |
| `processing_records` | Individual lot processing outcomes |
| `yield_records` | Yield % tracking (meat yield, shell yield) |
| `by_products` | Explicit by-product tracking |

**SQL to list all tables in ClamFlow:**
```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;
```

### 1.2 What fields are needed for CalciWorks shell receipt sync?

When the table is found, check for:
- `shell_weight_kg` or `shells_kg` — quantity of shells produced
- `batch_id` / `lot_number` — reference back to the incoming lot
- `processing_date` / `shift_date` — date of production
- `status` — is the record finalised/confirmed?

### 1.3 If no shell output table exists yet

ClamFlow needs to **add** one. Recommended schema:

```sql
CREATE TABLE clamflow.production_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id          UUID REFERENCES clamflow.lots(id),
  batch_date      DATE NOT NULL,
  clam_in_kg      NUMERIC(15,3),   -- input weight
  meat_yield_kg   NUMERIC(15,3),   -- clam meat extracted
  shell_yield_kg  NUMERIC(15,3),   -- shell by-product (this is what CalciWorks needs)
  waste_kg        NUMERIC(15,3),
  shift_id        UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

Once this exists:
- Suite's `clamflow.js` will add `fetchShellProduction(fromDate, toDate)`
- CalciWorks will have a **"Sync from ClamFlow"** button that pulls unimported batches
- Synced batches create `suite.shell_stock` entries with `entry_type = 'receipt'`

### 1.4 Currently Safe Columns Registered in Suite

```js
// supabaseClamFlow.js SAFE_COLUMNS.lots
'id', 'lot_number', 'supplier_id', 'species', 'weight_kg', 'arrival_date', 'status', 'created_at'
```

Lots = **incoming raw clam** (not shell output). Do not derive shell weight from lot weight — it's inaccurate without actual yield data.

---

## 2. ClamFlow — Onboarding Components (For Suite Migration)

ClamFlow currently has an onboarding flow for registering plant workers (face enrollment, RFID assignment, Aadhaar verification). The goal is to **move onboarding into Suite** as a dedicated module, since Suite is the master platform and ClamFlow is a plant-floor operational app.

### 2.1 What ClamFlow onboarding currently does — investigate:

| Component | What to check |
|---|---|
| Person record creation | What fields are collected? (`full_name`, `phone`, `aadhaar_last4`, `photo`?) |
| Face enrollment | AWS Rekognition collection name, API endpoint used |
| RFID assignment | How is RFID linked? Table/column? |
| Aadhaar verification | 3rd-party API? Which one? What's stored? |
| Onboarding status | `onboarding_pending` table — what statuses exist? |

**SQL to inspect ClamFlow onboarding tables:**
```sql
-- List all columns in onboarding_pending
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'onboarding_pending';

-- List all columns in person_records
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'person_records';
```

### 2.2 Suite Registry already has the skeleton:

```
registry.entities         — master people store (vendor/staff/buyer/visitor)
registry.entity_roles     — roles per entity per company
registry.biometrics       — planned: face_enrolled, rfid_tag, aadhaar_ref_token
```

### 2.3 Migration plan (once ClamFlow onboarding is understood):

1. Build **Onboarding module** in Suite under `/operations/onboarding`
2. Suite does: entity creation → RFID assignment → face enrollment (AWS Rekognition `IndexFaces`)  
3. ClamFlow only does: `SearchFacesByImage` against the enrolled collection (read-only gate check)
4. ClamFlow `person_records` are retired in favour of `registry.entities`

---

## 3. Relish Approvals — Migration to Pramaana

Relish Approvals is a **live production system** (`ewbguvwrejdvlhzcqlbp`, relishvoucher.vercel.app).  
It uses Node.js + Express + vanilla JS, mobile OTP auth (NOT Supabase Auth).  
It will eventually be retired into the `pramaana` schema in Suite.

### 3.1 What to investigate in Approvals DB:

| Question | SQL to run |
|---|---|
| What tables exist? | `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'` |
| What voucher types are active? | `SELECT DISTINCT head_of_account, sub_head_of_account FROM vouchers ORDER BY 1,2` |
| How many vouchers per company? | `SELECT company_id, COUNT(*) FROM vouchers GROUP BY company_id` |
| What's the payees structure? | `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payees'` |
| Pending/in-flight approvals? | `SELECT status, COUNT(*) FROM vouchers GROUP BY status` |
| Date range of data | `SELECT MIN(created_at), MAX(created_at) FROM vouchers` |

### 3.2 Current fields Suite already reads from Approvals (for Tally Export):

```
vouchers: id, company_id, serial_number, head_of_account, sub_head_of_account,
          narration, amount, payment_mode, status, approved_at, completed_at,
          created_at, narration_items, invoice_reference,
          payees(id, name, mobile, bank_account)
```

### 3.3 Approvals company ID mapping (must verify these are correct):

| Suite UUID | Approvals string ID | Company |
|---|---|---|
| `b8beb440-df7f-48e8-a012-ac5750502eca` | `relish-hhc` | RHHF |
| `bc455c94-0bcd-4d66-a040-d29ed880d22f` | `relish-foods` | RFPL |

**Verify with:** `SELECT DISTINCT company_id FROM vouchers;`

### 3.4 Migration approach (future work):

1. Freeze Approvals — no new vouchers after cutover date
2. Export all historical vouchers as JSON
3. Import into `pramaana.vouchers` with `source = 'approvals_migration'`
4. Keep Approvals DB alive read-only for 12 months for audit trail
5. Suite takes over as the voucher/approval system

---

## 4. Action Items Summary

| # | Item | Owner | Blocking |
|---|---|---|---|
| CF-1 | Confirm ClamFlow shell output table exists or add one | ClamFlow dev / Motty | CalciWorks auto-sync |
| CF-2 | Get full ClamFlow table list (run SQL above) | Motty | CalciWorks + Onboarding |
| CF-3 | Inspect ClamFlow onboarding flow fields | Motty | Suite Onboarding module |
| AP-1 | Run voucher type query on Approvals DB | Motty | Pramaana migration plan |
| AP-2 | Confirm company ID mapping is correct | Motty | Tally export accuracy |
| AP-3 | Determine cutover date for Approvals freeze | Management | Pramaana build timeline |
