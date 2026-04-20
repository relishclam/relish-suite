// ClamFlow DB — READ ONLY — Supabase client
// Owns: Suppliers, Plant Staff, Lots, Production data, Biometrics
// Location: RHHF Panavally Processing Plant
// Suite reads: suppliers, person_records, user_profiles, onboarding_pending, lots
// NEVER write, NEVER alter schema, NEVER query biometric raw data
import { createClient } from '@supabase/supabase-js';

const clamflowUrl = import.meta.env.VITE_CLAMFLOW_SUPABASE_URL;
const clamflowAnonKey = import.meta.env.VITE_CLAMFLOW_SUPABASE_ANON_KEY;

if (!clamflowUrl || !clamflowAnonKey) {
  console.warn('ClamFlow Supabase credentials missing — ClamFlow features will be unavailable');
}

export const supabaseClamFlow = clamflowUrl && clamflowAnonKey
  ? createClient(clamflowUrl, clamflowAnonKey)
  : null;

// ─── SAFE COLUMN LISTS ─────────────────────────────────────
// NEVER use .select('*') on any ClamFlow table.
// Always use these explicit column lists.
// NEVER include: face_embedding, face_image_path, face_image, password_hash
// aadhar_number: read but MASK immediately → XXXX-XXXX-XXXX-{last4}

export const SAFE_COLUMNS = {
  suppliers: [
    'id',
    'person_record_id',
    'supplier_type',
    'bank_name',
    'bank_branch',
    'bank_account_number',
    'bank_ifsc',
    'pan_number',
    'gst_number',
    'payment_terms',
    'is_active',
    'created_at',
    'updated_at',
  ].join(','),

  person_records: [
    'id',
    'full_name',
    'person_type',
    'phone',
    'email',
    'address_line1',
    'address_line2',
    'city',
    'state',
    'pincode',
    'is_active',
    'aadhaar_verified',
    'face_enrolled',
    'onboarding_status',
    'created_at',
    'updated_at',
  ].join(','),

  user_profiles: [
    'id',
    'full_name',
    'role',
    'phone',
    'email',
    'is_active',
    'created_at',
    'updated_at',
  ].join(','),

  onboarding_pending: [
    'id',
    'person_record_id',
    'status',
    'system_account_created',
    'rfid_assigned',
    'started_at',
    'completed_at',
    'created_at',
    'updated_at',
  ].join(','),

  lots: [
    'id',
    'lot_number',
    'supplier_id',
    'species',
    'weight_kg',
    'arrival_date',
    'status',
    'created_at',
  ].join(','),
};

// ─── AADHAAR MASKING ────────────────────────────────────────
// Mask Aadhaar number immediately upon retrieval.
// Input: '123456789012' → Output: 'XXXX-XXXX-XXXX-9012'
// If already masked or null, return as-is.
export function maskAadhaar(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return 'XXXX-XXXX-XXXX-XXXX';
  const last4 = digits.slice(-4);
  return `XXXX-XXXX-XXXX-${last4}`;
}
