import { supabase } from './supabase';

// ─── Read all active companies ───────────────────────────
export async function fetchCompanies() {
  const { data, error } = await supabase
    .schema('registry')
    .from('companies')
    .select('id, name, short_name, gstin, address_line1, phone, is_active')
    .eq('is_active', true)
    .order('short_name');
  if (error) throw error;
  return data;
}

// ─── Read single company ─────────────────────────────────
export async function fetchCompany(companyId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Update company (super_admin only) ───────────────────
export async function updateCompany(companyId, updates) {
  const { error } = await supabase
    .schema('registry')
    .from('companies')
    .update(updates)
    .eq('id', companyId);
  if (error) throw error;
}
