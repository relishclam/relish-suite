import { supabase } from './supabase';

// ─── List all profiles (super_admin only) ────────────────
export async function fetchProfiles() {
  const { data, error } = await supabase
    .schema('registry')
    .from('profiles')
    .select('id, email, full_name, is_active, is_super_admin, created_at, updated_at')
    .order('full_name');
  if (error) throw error;
  return data;
}

// ─── Get single profile ──────────────────────────────────
export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Update profile ──────────────────────────────────────
// registry.profiles has NO role column.
// Only full_name, email, mobile, is_active are writable.
export async function updateProfile(userId, updates) {
  const { full_name, email, mobile, is_active } = updates;
  const safe = {};
  if (full_name  !== undefined) safe.full_name  = full_name;
  if (email      !== undefined) safe.email      = email;
  if (mobile     !== undefined) safe.mobile     = mobile;
  if (is_active  !== undefined) safe.is_active  = is_active;
  const { error } = await supabase
    .schema('registry')
    .from('profiles')
    .update(safe)
    .eq('id', userId);
  if (error) throw error;
}

// ─── Get company assignments for a user ──────────────────
export async function fetchUserCompanies(userId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('company_users')
    .select('id, company_id, role, is_primary, company:companies(id, name, short_name, code)')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

// ─── Assign user to a company ────────────────────────────
// role defaults to 'viewer' — company_users.role is NOT NULL
export async function assignUserCompany(userId, companyId, role = 'viewer') {
  const { error } = await supabase
    .schema('registry')
    .from('company_users')
    .insert({ user_id: userId, company_id: companyId, role });
  if (error) throw error;
}

// ─── Remove user from a company ──────────────────────────
export async function removeUserCompany(companyUserId) {
  const { error } = await supabase
    .schema('registry')
    .from('company_users')
    .delete()
    .eq('id', companyUserId);
  if (error) throw error;
}

// ─── Create user via Supabase Auth (super_admin invites) ─
// auth.admin.inviteUserByEmail() requires the service_role key and cannot be
// called client-side (always 403). Routed through the invite-user Edge Function
// which runs server-side with the service_role key and verifies is_super_admin.
export async function inviteUser(email) {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: { email },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
