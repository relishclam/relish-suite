import { supabase } from './supabase';

// ─── List all profiles (super_admin only) ────────────────
export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active, created_at, updated_at')
    .order('full_name');
  if (error) throw error;
  return data;
}

// ─── Get single profile ──────────────────────────────────
export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Update profile (role, name, active status) ──────────
export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Get companies assigned to a user ────────────────────
export async function fetchUserCompanies(userId) {
  const { data, error } = await supabase
    .from('user_companies')
    .select('id, company_id, companies(id, name, short_name)')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

// ─── Assign user to a company ────────────────────────────
export async function assignUserCompany(userId, companyId) {
  const { data, error } = await supabase
    .from('user_companies')
    .insert({ user_id: userId, company_id: companyId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Remove user from a company ──────────────────────────
export async function removeUserCompany(userCompanyId) {
  const { error } = await supabase
    .from('user_companies')
    .delete()
    .eq('id', userCompanyId);
  if (error) throw error;
}

// ─── Create user via Supabase Auth (super_admin invites) ─
export async function inviteUser(email) {
  // Uses Supabase Auth magic link invite
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error) throw error;
  return data;
}
