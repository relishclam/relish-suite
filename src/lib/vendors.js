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
    .eq('role', 'Vendor')
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).sort((a, b) =>
    (a.entity?.display_name || '').localeCompare(b.entity?.display_name || '')
  );
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
  const { data: entity, error: entityError } = await supabase
    .schema('registry')
    .from('entities')
    .insert({
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
      bank_name: vendorData.bank_details ?? null,
      is_active: true,
      source_app: 'suite',
    })
    .select()
    .single();
  if (entityError) throw entityError;

  const { data: role, error: roleError } = await supabase
    .schema('registry')
    .from('entity_roles')
    .insert({
      entity_id: entity.id,
      company_id: companyId,
      role: 'Vendor',
      is_active: true,
    })
    .select()
    .single();
  if (roleError) throw roleError;

  return { entity, role };
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
    bank_name:    updates.bank_details,
    is_active:    updates.is_active,
  };
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const { data, error } = await supabase
    .schema('registry')
    .from('entities')
    .update(allowed)
    .eq('id', entityId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Toggle vendor active state (entity_roles.is_active) ─────────
// Deactivating a vendor role hides it from vendor lists without
// deleting the shared entity record.
export async function toggleVendorActive(entityRoleId, isActive) {
  const { data, error } = await supabase
    .schema('registry')
    .from('entity_roles')
    .update({ is_active: isActive })
    .eq('id', entityRoleId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

