import { supabase } from './supabase';

// ─── List buyers for a company ───────────────────────────
export async function fetchBuyers(companyId, { search = '', activeOnly = true } = {}) {
  let query = supabase
    .from('buyers')
    .select('*')
    .eq('company_id', companyId)
    .order('name');

  if (activeOnly) query = query.eq('is_active', true);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ─── Get single buyer ────────────────────────────────────
export async function fetchBuyer(buyerId) {
  const { data, error } = await supabase
    .from('buyers')
    .select('*')
    .eq('id', buyerId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Create buyer ────────────────────────────────────────
export async function createBuyer(buyer) {
  const { data, error } = await supabase
    .from('buyers')
    .insert(buyer)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Update buyer ────────────────────────────────────────
export async function updateBuyer(buyerId, updates) {
  const { data, error } = await supabase
    .from('buyers')
    .update(updates)
    .eq('id', buyerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Toggle buyer active/inactive ────────────────────────
export async function toggleBuyerActive(buyerId, isActive) {
  return updateBuyer(buyerId, { is_active: isActive });
}
