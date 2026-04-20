// ClamFlow data access — READ ONLY
// RHHF Panavally Processing Plant data
// NEVER write, NEVER alter, NEVER query biometric raw data
import { supabaseClamFlow, SAFE_COLUMNS, maskAadhaar } from './supabaseClamFlow';

const CF_UNAVAILABLE = 'ClamFlow database not configured';

// ─── Suppliers (with person_records join) ────────────────
export async function fetchClamFlowSuppliers({ search = '', activeOnly = true } = {}) {
  if (!supabaseClamFlow) throw new Error(CF_UNAVAILABLE);

  let query = supabaseClamFlow
    .from('suppliers')
    .select(`${SAFE_COLUMNS.suppliers}, person_records(${SAFE_COLUMNS.person_records})`)
    .order('created_at', { ascending: false });

  if (activeOnly) query = query.eq('is_active', true);
  if (search) query = query.ilike('person_records.full_name', `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ─── Single supplier detail ──────────────────────────────
export async function fetchClamFlowSupplier(supplierId) {
  if (!supabaseClamFlow) throw new Error(CF_UNAVAILABLE);

  const { data, error } = await supabaseClamFlow
    .from('suppliers')
    .select(`${SAFE_COLUMNS.suppliers}, person_records(${SAFE_COLUMNS.person_records})`)
    .eq('id', supplierId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Onboarding status for a supplier's person_record ────
export async function fetchOnboardingStatus(personRecordId) {
  if (!supabaseClamFlow) throw new Error(CF_UNAVAILABLE);

  const { data, error } = await supabaseClamFlow
    .from('onboarding_pending')
    .select(SAFE_COLUMNS.onboarding_pending)
    .eq('person_record_id', personRecordId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Lot history for a supplier (last 10) ────────────────
export async function fetchSupplierLots(supplierId, { limit = 10 } = {}) {
  if (!supabaseClamFlow) throw new Error(CF_UNAVAILABLE);

  const { data, error } = await supabaseClamFlow
    .from('lots')
    .select(SAFE_COLUMNS.lots)
    .eq('supplier_id', supplierId)
    .order('arrival_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ─── Lot summary for a supplier (count + total kg) ───────
export async function fetchSupplierLotSummary(supplierId) {
  if (!supabaseClamFlow) throw new Error(CF_UNAVAILABLE);

  const { data, error } = await supabaseClamFlow
    .from('lots')
    .select('id, weight_kg')
    .eq('supplier_id', supplierId);
  if (error) throw error;

  const totalLots = data?.length || 0;
  const totalKg = data?.reduce((sum, lot) => sum + (parseFloat(lot.weight_kg) || 0), 0) || 0;
  return { totalLots, totalKg };
}

// ─── Staff / Personnel (person_records where person_type = 'staff') ──
export async function fetchClamFlowStaff({ search = '' } = {}) {
  if (!supabaseClamFlow) throw new Error(CF_UNAVAILABLE);

  let query = supabaseClamFlow
    .from('person_records')
    .select(SAFE_COLUMNS.person_records)
    .eq('person_type', 'staff')
    .eq('is_active', true)
    .order('full_name');

  if (search) query = query.ilike('full_name', `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ─── User profiles (plant staff accounts) ────────────────
export async function fetchClamFlowUserProfiles() {
  if (!supabaseClamFlow) throw new Error(CF_UNAVAILABLE);

  const { data, error } = await supabaseClamFlow
    .from('user_profiles')
    .select(SAFE_COLUMNS.user_profiles)
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return data;
}

// Re-export maskAadhaar for convenience
export { maskAadhaar };
