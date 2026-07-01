import { supabase } from './supabase';

// ─── Fetch all bank accounts for a company ───────────────
export async function fetchCompanyBankAccounts(companyId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('company_bank_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ─── Create a bank account ───────────────────────────────
export async function createCompanyBankAccount(payload) {
  const { data, error } = await supabase
    .schema('registry')
    .from('company_bank_accounts')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Update a bank account ───────────────────────────────
export async function updateCompanyBankAccount(id, payload) {
  const { error } = await supabase
    .schema('registry')
    .from('company_bank_accounts')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

// ─── Delete a bank account ───────────────────────────────
export async function deleteCompanyBankAccount(id) {
  const { error } = await supabase
    .schema('registry')
    .from('company_bank_accounts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
