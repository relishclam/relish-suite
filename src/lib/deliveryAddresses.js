import { supabase } from './supabase';

// ─── List delivery addresses for a company ───────────────
export async function fetchDeliveryAddresses(companyId) {
  const { data, error } = await supabase
    .from('delivery_addresses')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('label');
  if (error) throw error;
  return data;
}

// ─── Get single delivery address ─────────────────────────
export async function fetchDeliveryAddress(addressId) {
  const { data, error } = await supabase
    .from('delivery_addresses')
    .select('*')
    .eq('id', addressId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Create delivery address ─────────────────────────────
export async function createDeliveryAddress(address) {
  const { data, error } = await supabase
    .from('delivery_addresses')
    .insert(address)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Update delivery address ─────────────────────────────
export async function updateDeliveryAddress(addressId, updates) {
  const { data, error } = await supabase
    .from('delivery_addresses')
    .update(updates)
    .eq('id', addressId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Toggle active/inactive ──────────────────────────────
export async function toggleDeliveryAddressActive(addressId, isActive) {
  return updateDeliveryAddress(addressId, { is_active: isActive });
}
