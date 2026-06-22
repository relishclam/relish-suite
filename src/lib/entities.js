import { supabase } from './supabase';

// Role → entity type mapping (PERSON vs ORGANISATION)
const ROLE_ENTITY_TYPE = {
  Vendor:     'ORGANISATION',
  Customer:   'ORGANISATION',
  Supplier:   'ORGANISATION',
  Government: 'ORGANISATION',
  Fisher:     'PERSON',
  Staff:      'PERSON',
  Management: 'PERSON',
  Contractor: 'PERSON',
  Auditor:    'PERSON',
};

export const ENTITY_ROLES = [
  'Vendor', 'Customer', 'Staff', 'Management',
  'Auditor', 'Government', 'Contractor', 'Supplier', 'Fisher',
];

// ─── Fetch all entity_roles for a company (with nested entity) ────────────────
export async function fetchEntities(companyId, { search = '', activeOnly = true, roles = null } = {}) {
  let query = supabase
    .schema('registry')
    .from('entity_roles')
    .select(`
      id,
      role,
      tally_ledger,
      department,
      designation,
      is_active,
      entity:entities(
        id, type, display_name, alias,
        mobile, email, gstin, pan, local_reg_number, local_tax_number,
        address_line1, address_line2, city, state, pincode, country,
        bank_name, bank_account_holder, bank_account_number, bank_ifsc, bank_swift, upi_id,
        is_active
      )
    `)
    .eq('company_id', companyId);

  if (activeOnly) query = query.eq('is_active', true);
  if (roles && roles.length > 0) query = query.in('role', roles);

  const { data, error } = await query;
  if (error) throw error;

  let results = (data || []).sort((a, b) =>
    (a.entity?.display_name || '').localeCompare(b.entity?.display_name || '')
  );

  if (search) {
    const s = search.toLowerCase();
    results = results.filter((r) =>
      (r.entity?.display_name || '').toLowerCase().includes(s) ||
      (r.entity?.mobile || '').includes(s) ||
      (r.entity?.gstin || '').toLowerCase().includes(s)
    );
  }

  return results;
}

// ─── Create entity + entity_role ─────────────────────────────────────────────
export async function createEntity(companyId, data, userId) {
  const entityId = crypto.randomUUID();
  const entityType = ROLE_ENTITY_TYPE[data.role] || 'ORGANISATION';

  const { error: entityError } = await supabase
    .schema('registry')
    .from('entities')
    .insert({
      id:                   entityId,
      type:                 entityType,
      display_name:         data.display_name,
      alias:                data.alias ?? null,
      mobile:               data.mobile ?? null,
      email:                data.email ?? null,
      gstin:                data.gstin ?? null,
      pan:                  data.pan ?? null,
      local_reg_number:     data.local_reg_number ?? null,
      local_tax_number:     data.local_tax_number ?? null,
      address_line1:        data.address_line1 ?? null,
      address_line2:        data.address_line2 ?? null,
      city:                 data.city ?? null,
      state:                data.state ?? null,
      pincode:              data.pincode ?? null,
      country:              data.country || 'India',
      bank_name:            data.bank_name ?? null,
      bank_account_holder:  data.bank_account_holder ?? null,
      bank_account_number:  data.bank_account_number ?? null,
      bank_ifsc:            data.bank_ifsc ?? null,
      bank_swift:           data.bank_swift ?? null,
      upi_id:               data.upi_id ?? null,
      is_active:            true,
      source_app:           'suite',
      created_by:           userId ?? null,
    });
  if (entityError) throw entityError;

  const roleId = crypto.randomUUID();
  const { error: roleError } = await supabase
    .schema('registry')
    .from('entity_roles')
    .insert({
      id:           roleId,
      entity_id:    entityId,
      company_id:   companyId,
      role:         data.role,
      tally_ledger: data.tally_ledger ?? null,
      designation:  data.designation ?? null,
      department:   data.department ?? null,
      is_active:    true,
    });
  if (roleError) throw roleError;

  return { entity: { id: entityId }, role: { id: roleId } };
}

// ─── Update entity fields + role-level fields ─────────────────────────────────
// entityId = registry.entities.id
// roleId   = registry.entity_roles.id
export async function updateEntity(entityId, roleId, data) {
  const entityUpdate = {
    display_name:        data.display_name,
    alias:               data.alias ?? null,
    mobile:              data.mobile ?? null,
    email:               data.email ?? null,
    gstin:               data.gstin ?? null,
    pan:                 data.pan ?? null,
    local_reg_number:    data.local_reg_number ?? null,
    local_tax_number:    data.local_tax_number ?? null,
    address_line1:       data.address_line1 ?? null,
    address_line2:       data.address_line2 ?? null,
    city:                data.city ?? null,
    state:               data.state ?? null,
    pincode:             data.pincode ?? null,
    country:             data.country ?? null,
    bank_name:           data.bank_name ?? null,
    bank_account_holder: data.bank_account_holder ?? null,
    bank_account_number: data.bank_account_number ?? null,
    bank_ifsc:           data.bank_ifsc ?? null,
    bank_swift:          data.bank_swift ?? null,
    upi_id:              data.upi_id ?? null,
  };
  Object.keys(entityUpdate).forEach((k) => {
    if (entityUpdate[k] === undefined) delete entityUpdate[k];
  });

  const { error: entityError } = await supabase
    .schema('registry')
    .from('entities')
    .update(entityUpdate)
    .eq('id', entityId);
  if (entityError) throw entityError;

  const roleUpdate = {
    tally_ledger: data.tally_ledger ?? null,
    designation:  data.designation ?? null,
    department:   data.department ?? null,
  };
  const { error: roleError } = await supabase
    .schema('registry')
    .from('entity_roles')
    .update(roleUpdate)
    .eq('id', roleId);
  if (roleError) throw roleError;
}

// ─── Toggle entity_role active state ─────────────────────────────────────────
// Deactivating a role hides the entity from that role's list without
// deleting the shared entity record.
export async function toggleEntityActive(roleId, isActive) {
  const { error } = await supabase
    .schema('registry')
    .from('entity_roles')
    .update({ is_active: isActive })
    .eq('id', roleId);
  if (error) throw error;
}

// ─── Search for potential duplicate entities ──────────────────────────────────
// Checks GSTIN first (strongest signal), then mobile, then display_name.
// Foreign companies (e.g. Hong Kong) have no GSTIN — mobile/name check applies.
// Returns up to 5 matching entity rows.
export async function searchDuplicateEntity({ gstin, mobile, display_name }) {
  if (gstin) {
    const { data } = await supabase
      .schema('registry')
      .from('entities')
      .select('id, type, display_name, mobile, gstin, city, country')
      .eq('gstin', gstin)
      .limit(5);
    if (data?.length) return data;
  }
  if (mobile) {
    const { data } = await supabase
      .schema('registry')
      .from('entities')
      .select('id, type, display_name, mobile, gstin, city, country')
      .eq('mobile', mobile)
      .limit(5);
    if (data?.length) return data;
  }
  if (display_name && display_name.trim().length >= 3) {
    const { data } = await supabase
      .schema('registry')
      .from('entities')
      .select('id, type, display_name, mobile, gstin, city, country')
      .ilike('display_name', `%${display_name.trim()}%`)
      .limit(5);
    if (data?.length) return data;
  }
  return [];
}

// ─── Add a new role to an existing entity (no new entity row) ────────────────
// Use when an entity like "FoodStream Ltd." needs to be both Vendor AND Customer.
export async function addRoleToEntity(entityId, companyId, data) {
  const roleId = crypto.randomUUID();
  const { error } = await supabase
    .schema('registry')
    .from('entity_roles')
    .insert({
      id:           roleId,
      entity_id:    entityId,
      company_id:   companyId,
      role:         data.role,
      tally_ledger: data.tally_ledger ?? null,
      designation:  data.designation ?? null,
      department:   data.department ?? null,
      is_active:    true,
    });
  if (error) throw error;
  return { id: roleId };
}

// ─── Fetch all roles for an entity within a company ───────────────────────────
export async function fetchEntityRoles(entityId, companyId) {
  const { data, error } = await supabase
    .schema('registry')
    .from('entity_roles')
    .select('id, role, tally_ledger, designation, department, is_active')
    .eq('entity_id', entityId)
    .eq('company_id', companyId)
    .order('role');
  if (error) throw error;
  return data || [];
}
