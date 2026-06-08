import { supabase } from './supabase';

// ─── Fetch all buyers for a company ──────────────────────────────
// Returns entity_roles[] each with a nested entity object.
// Callers use: vr.entity.id, vr.entity.display_name, etc.
export async function fetchBuyers(companyId) {
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
        is_active, source_app
      )
    `)
    .eq('company_id', companyId)
    .eq('role', 'Customer')
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).sort((a, b) =>
    (a.entity?.display_name || '').localeCompare(b.entity?.display_name || '')
  );
}

// ─── Fetch single buyer entity by entity_id ──────────────────────
export async function fetchBuyer(entityId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Create buyer: insert entity then entity_role ─────────────────
export async function createBuyer(companyId, buyerData) {
  const entityId = crypto.randomUUID();
  const { error: entityError } = await supabase
    .schema('registry')
    .from('entities')
    .insert({
      id: entityId,
      type: 'ORGANISATION',
      display_name: buyerData.name,
      alias: buyerData.alias ?? null,
      gstin: buyerData.gstin ?? null,
      mobile: buyerData.phone ?? null,
      email: buyerData.email ?? null,
      address_line1: buyerData.address_line1 ?? null,
      address_line2: buyerData.address_line2 ?? null,
      city: buyerData.city ?? null,
      state: buyerData.state ?? null,
      pincode: buyerData.postal_code ?? null,
      country: buyerData.country ?? null,
      is_active: true,
      source_app: 'suite',
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
      role: 'Customer',
      is_active: true,
    });
  if (roleError) throw roleError;

  return { entity: { id: entityId }, role: { id: roleId } };
}

// ─── Update buyer: update entity fields only ─────────────────────
export async function updateBuyer(entityId, updates) {
  const allowed = {
    display_name: updates.name,
    alias:        updates.alias,
    gstin:        updates.gstin,
    mobile:       updates.phone,
    email:        updates.email,
    address_line1: updates.address_line1,
    address_line2: updates.address_line2,
    city:         updates.city,
    state:        updates.state,
    pincode:      updates.postal_code,
    country:      updates.country,
    is_active:    updates.is_active,
  };
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const { error } = await supabase
    .schema('registry')
    .from('entities')
    .update(allowed)
    .eq('id', entityId);
  if (error) throw error;
}

// ─── Toggle buyer active state (entity_roles.is_active) ──────────
// Deactivating a buyer role hides it from buyer lists without
// deleting the shared entity record.
export async function toggleBuyerActive(entityRoleId, isActive) {
  const { error } = await supabase
    .schema('registry')
    .from('entity_roles')
    .update({ is_active: isActive })
    .eq('id', entityRoleId);
  if (error) throw error;
}

