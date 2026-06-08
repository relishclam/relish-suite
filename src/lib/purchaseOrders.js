import { supabase } from './supabase';

// ─── List purchase orders for a company ──────────────────────────
// List view uses snapshot columns only — no cross-schema joins.
// vendor_name is snapshotted on the PO at create time.
export async function fetchPurchaseOrders(companyId, { status, search = '', limit = 50, offset = 0 } = {}) {
  let query = supabase
    .schema('suite')
    .from('purchase_orders')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('po_number', `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

// ─── Get single PO with line items ───────────────────────────────
// Fetches PO + line items, then separately fetches vendor entity
// if vendor_entity_id is set. Attaches as po.vendor_entity.
export async function fetchPurchaseOrder(poId) {
  const { data: po, error: poError } = await supabase
    .schema('suite')
    .from('purchase_orders')
    .select('*')
    .eq('id', poId)
    .single();
  if (poError) throw poError;

  const { data: lineItems, error: liError } = await supabase
    .schema('suite')
    .from('po_line_items')
    .select('*')
    .eq('po_id', poId)
    .order('line_number');
  if (liError) throw liError;

  let vendorEntity = null;
  if (po.vendor_entity_id) {
    const { data: entity } = await supabase
      .schema('registry')
      .from('entities')
      .select('*')
      .eq('id', po.vendor_entity_id)
      .single();
    vendorEntity = entity ?? null;
  }

  return { ...po, line_items: lineItems, vendor_entity: vendorEntity };
}

// ─── Create PO with line items ───────────────────────────────────
// company is the full activeCompany object { id, code, ... }
export async function createPurchaseOrder(po, lineItems, company) {
  const { data: poNumber, error: seqError } = await supabase
    .schema('registry')
    .rpc('next_cal_sequence', {
      p_company_id:   company.id,
      p_company_code: company.code,
      p_prefix:       'PO',
    });
  if (seqError) throw seqError;

  const poId = crypto.randomUUID();
  const { error: poError } = await supabase
    .schema('suite')
    .from('purchase_orders')
    .insert({ id: poId, ...po, po_number: poNumber });
  if (poError) throw poError;

  if (lineItems?.length) {
    const lines = lineItems.map((li, idx) => ({
      ...li,
      po_id: poId,
      line_number: idx + 1,
    }));
    const { error: liError } = await supabase
      .schema('suite')
      .from('po_line_items')
      .insert(lines);
    if (liError) throw liError;
  }

  return fetchPurchaseOrder(poId);
}

// ─── Update PO + replace line items ──────────────────────────────
export async function updatePurchaseOrder(poId, updates, lineItems) {
  const { error: poError } = await supabase
    .schema('suite')
    .from('purchase_orders')
    .update(updates)
    .eq('id', poId);
  if (poError) throw poError;

  if (lineItems) {
    const { error: delError } = await supabase
      .schema('suite')
      .from('po_line_items')
      .delete()
      .eq('po_id', poId);
    if (delError) throw delError;

    if (lineItems.length) {
      const lines = lineItems.map((li, idx) => ({
        ...li,
        po_id: poId,
        line_number: idx + 1,
      }));
      const { error: liError } = await supabase
        .schema('suite')
        .from('po_line_items')
        .insert(lines);
      if (liError) throw liError;
    }
  }

  return fetchPurchaseOrder(poId);
}

// ─── Update PO status ────────────────────────────────────────────
export async function updatePurchaseOrderStatus(poId, status) {
  const { data, error } = await supabase
    .schema('suite')
    .from('purchase_orders')
    .update({ status })
    .eq('id', poId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── PO Line Item Calculations ───────────────────────────────────
// lineAmount = qty * price * (1 - discount/100)
export function calcLineAmount(qty, price, discount = 0) {
  return parseFloat((qty * price * (1 - discount / 100)).toFixed(2));
}

// subtotal = SUM(line amounts)
// discountAmount = subtotal * overall_discount / 100
// tax = (subtotal - discountAmount) * tax_rate / 100
// total = subtotal - discountAmount + tax + extra_charges
export function calcPOTotals(lineItems, { overallDiscount = 0, taxRate = 0, extraCharges = 0 } = {}) {
  const subtotal = lineItems.reduce((sum, li) => {
    return sum + calcLineAmount(
      parseFloat(li.qty)      || 0,
      parseFloat(li.price)    || 0,
      parseFloat(li.discount) || 0
    );
  }, 0);

  const discountAmount = parseFloat((subtotal * overallDiscount / 100).toFixed(2));
  const taxableAmount  = subtotal - discountAmount;
  const tax            = parseFloat((taxableAmount * taxRate / 100).toFixed(2));
  const total          = parseFloat((taxableAmount + tax + (parseFloat(extraCharges) || 0)).toFixed(2));

  return { subtotal, discountAmount, taxableAmount, tax, total };
}

