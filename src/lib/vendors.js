import { supabase } from './supabase';

// ─── List vendors for a company ──────────────────────────
export async function fetchVendors(companyId, { search = '', activeOnly = true } = {}) {
  let query = supabase
    .from('vendors')
    .select('*')
    .eq('company_id', companyId)
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ─── Get single vendor ───────────────────────────────────
export async function fetchVendor(vendorId) {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', vendorId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Create vendor ───────────────────────────────────────
export async function createVendor(vendor) {
  const { data, error } = await supabase
    .from('vendors')
    .insert(vendor)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Update vendor ───────────────────────────────────────
export async function updateVendor(vendorId, updates) {
  const { data, error } = await supabase
    .from('vendors')
    .update(updates)
    .eq('id', vendorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Toggle vendor active/inactive ───────────────────────
export async function toggleVendorActive(vendorId, isActive) {
  return updateVendor(vendorId, { is_active: isActive });
}
