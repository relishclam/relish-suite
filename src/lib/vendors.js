import { supabase } from './supabase';

// ─── Fetch all vendors for a company ─────────────────────────────
// Returns entity_roles[] each with a nested entity object.
// Callers use: vr.entity.id, vr.entity.display_name, etc.
export async function fetchVendors(companyId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('entity_roles')
    .select(`
      id,
      role,
      is_active,
      tally_ledger,
      entity:entities(
        id, display_name, alias, gstin, pan,
        mobile, email,
        address_line1, address_line2, city, state, pincode, country,
        bank_name, bank_account_holder, bank_account_number, bank_ifsc, upi_id,
        is_active, source_app
      )
    `)
    .eq('company_id', companyId)
    .eq('role', 'Vendor');
  if (error) throw error;
  return (data || [])
    .filter((row) => row.is_active && row.entity?.is_active)
    .sort((a, b) => (a.entity?.display_name || '').localeCompare(b.entity?.display_name || ''));
}

// ─── Fetch single vendor entity by entity_id ─────────────────────
export async function fetchVendor(entityId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Create vendor: insert entity then entity_role ────────────────
export async function createVendor(companyId, vendorData) {
  const { data: { user } } = await supabase.auth.getUser();
  const entityId = crypto.randomUUID();
  const { error: entityError } = await supabase
    .schema('registry')
    .from('entities')
    .insert({
      id: entityId,
      type: 'ORGANISATION',
      display_name: vendorData.name,
      alias: vendorData.vendor_code ?? null,
      gstin: vendorData.gstin ?? null,
      mobile: vendorData.phone ?? null,
      email: vendorData.email ?? null,
      address_line1: vendorData.address_line1 ?? null,
      address_line2: vendorData.address_line2 ?? null,
      city: vendorData.city ?? null,
      state: vendorData.state ?? null,
      pincode: vendorData.postal_code ?? null,
      bank_name:           vendorData.bank_name ?? null,
      bank_account_holder: vendorData.bank_account_holder ?? null,
      bank_account_number: vendorData.bank_account_number ?? null,
      bank_ifsc:           vendorData.bank_ifsc ?? null,
      upi_id:              vendorData.upi_id ?? null,
      is_active: true,
      source_app: 'suite',
      created_by: user.id,
    });
  if (entityError) throw entityError;

  const roleId = crypto.randomUUID();
  const { error: roleError } = await supabase
    .schema('registry')
    .from('entity_roles')
    .insert({
      id: roleId,
      entity_id: entityId,
      company_id: companyId,
      role: 'Vendor',
      is_active: true,
    });
  if (roleError) throw roleError;

  return { entity: { id: entityId }, role: { id: roleId } };
}

// ─── Request a new vendor (accounts staff) ───────────────────────
// Creates entity + role as inactive / pending. Admin must approve.
export async function requestVendor(companyId, vendorData, requestedByName) {
  const { data: { user } } = await supabase.auth.getUser();
  const entityId = crypto.randomUUID();
  const { error: entityError } = await supabase
    .schema('registry')
    .from('entities')
    .insert({
      id:                  entityId,
      type:                'ORGANISATION',
      display_name:        vendorData.name,
      alias:               vendorData.vendor_code ?? null,
      gstin:               vendorData.gstin ?? null,
      mobile:              vendorData.phone ?? null,
      email:               vendorData.email ?? null,
      address_line1:       vendorData.address_line1 ?? null,
      address_line2:       vendorData.address_line2 ?? null,
      city:                vendorData.city ?? null,
      state:               vendorData.state ?? null,
      pincode:             vendorData.postal_code ?? null,
      bank_name:           vendorData.bank_name ?? null,
      bank_account_holder: vendorData.bank_account_holder ?? null,
      bank_account_number: vendorData.bank_account_number ?? null,
      bank_ifsc:           vendorData.bank_ifsc ?? null,
      upi_id:              vendorData.upi_id ?? null,
      is_active:           false,   // inactive until approved
      source_app:          'suite',
      created_by:          user.id,
    });
  if (entityError) throw entityError;

  const { error: roleError } = await supabase
    .schema('registry')
    .from('entity_roles')
    .insert({
      entity_id:              entityId,
      company_id:             companyId,
      role:                   'Vendor',
      is_active:              false,
      approval_status:        'pending',
      approval_requested_by:  requestedByName,
      approval_requested_at:  new Date().toISOString(),
    });
  if (roleError) throw roleError;

  return { entity: { id: entityId } };
}

// ─── Fetch pending vendor requests (admin view) ──────────────────
export async function fetchPendingVendors(companyId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('entity_roles')
    .select(`
      id,
      role,
      approval_status,
      approval_requested_by,
      approval_requested_at,
      entity:entities(
        id, display_name, gstin, mobile, email, city, state
      )
    `)
    .eq('company_id', companyId)
    .eq('role', 'Vendor')
    .eq('approval_status', 'pending');
  if (error) throw error;
  return (data || []).sort((a, b) =>
    new Date(b.approval_requested_at) - new Date(a.approval_requested_at));
}

// ─── Approve a pending vendor request ───────────────────────────
export async function approveVendorRequest(entityId, roleId) {
  const { error: entityError } = await supabase
    .schema('registry').from('entities')
    .update({ is_active: true })
    .eq('id', entityId);
  if (entityError) throw entityError;

  const { error: roleError } = await supabase
    .schema('registry').from('entity_roles')
    .update({ is_active: true, approval_status: 'approved' })
    .eq('id', roleId);
  if (roleError) throw roleError;
}

// ─── Reject a pending vendor request ────────────────────────────
export async function rejectVendorRequest(roleId) {
  const { error } = await supabase
    .schema('registry').from('entity_roles')
    .update({ approval_status: 'rejected' })
    .eq('id', roleId);
  if (error) throw error;
}

// ─── Update vendor: update entity fields only ────────────────────
export async function updateVendor(entityId, updates) {
  const allowed = {
    display_name: updates.name,
    alias:        updates.vendor_code,
    gstin:        updates.gstin,
    mobile:       updates.phone,
    email:        updates.email,
    address_line1: updates.address_line1,
    address_line2: updates.address_line2,
    city:         updates.city,
    state:        updates.state,
    pincode:      updates.postal_code,
    bank_name:    updates.bank_name,
    bank_account_holder:  updates.bank_account_holder,
    bank_account_number:  updates.bank_account_number,
    bank_ifsc:    updates.bank_ifsc,
    upi_id:       updates.upi_id,
    is_active:    updates.is_active,
  };
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const { error: entityError } = await supabase
    .schema('registry')
    .from('entities')
    .update(allowed)
    .eq('id', entityId);
  if (entityError) throw entityError;

  if (updates.is_active !== undefined) {
    const { error: roleError } = await supabase
      .schema('registry')
      .from('entity_roles')
      .update({ is_active: updates.is_active })
      .eq('entity_id', entityId)
      .eq('role', 'Vendor');
    if (roleError) throw roleError;
  }
}

// ─── Toggle vendor active state (entity_roles.is_active) ─────────
// Deactivating a vendor role hides it from vendor lists without
// deleting the shared entity record.
export async function toggleVendorActive(entityRoleId, isActive) {
  const { data: roleRow, error: roleLookupError } = await supabase
    .schema('registry')
    .from('entity_roles')
    .select('entity_id')
    .eq('id', entityRoleId)
    .single();
  if (roleLookupError) throw roleLookupError;

  const { error: entityError } = await supabase
    .schema('registry')
    .from('entities')
    .update({ is_active: isActive })
    .eq('id', roleRow.entity_id);
  if (entityError) throw entityError;

  const { error: roleError } = await supabase
    .schema('registry')
    .from('entity_roles')
    .update({ is_active: isActive })
    .eq('id', entityRoleId);
  if (roleError) throw roleError;
}

