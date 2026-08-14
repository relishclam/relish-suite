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

// ─── List all company_users (super_admin sees all; admin sees own company) ──
export async function fetchAllCompanyUsers() {
  const { data, error } = await supabase
    .schema('registry')
    .from('company_users')
    .select('id, user_id, company_id, role, company:companies(id, name, short_name, code)');
  if (error) throw error;
  return data ?? [];
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
    .select('id, company_id, role, is_primary, audit_edit_enabled, company:companies(id, name, short_name, code)')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

// ─── Assign user to a company ────────────────────────────
// role defaults to 'accounts' — company_users.role is NOT NULL
export async function assignUserCompany(userId, companyId, role = 'accounts') {
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
// ─── Update role for a company_users row ──────────────────────
export async function updateCompanyUserRole(companyUserId, role) {
  const { error } = await supabase
    .schema('registry')
    .from('company_users')
    .update({ role })
    .eq('id', companyUserId);
  if (error) throw error;
}

// ─── Toggle audit-edit mode for an auditor ────────────────────
// When enabled, the auditor can rename ledgers and move vouchers
// between ledgers in Pramaana. Revokable at any time by admin.
export async function setAuditEditMode(companyUserId, enabled) {
  const { error } = await supabase
    .schema('registry')
    .from('company_users')
    .update({ audit_edit_enabled: enabled })
    .eq('id', companyUserId);
  if (error) throw error;
}
// ─── Create user via Supabase Auth (admin invites) ───────────
// Routes through the invite-user Edge Function which runs server-side
// with the service_role key, creates the profile + company assignment,
// and sends an invite email with redirectTo pointing to /set-password.
export async function inviteUser(email, fullName, companyId, role) {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: { email, fullName, companyId, role },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function setUserDefaultPassword(userId, password) {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: { userId, password },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
