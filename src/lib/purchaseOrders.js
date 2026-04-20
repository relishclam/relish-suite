import { supabase } from './supabase';

// ─── List purchase orders for a company ──────────────────
export async function fetchPurchaseOrders(companyId, { status, search = '', limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('purchase_orders')
    .select('*, vendors(name), buyers(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('po_number', `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

// ─── Get single PO with line items ───────────────────────
export async function fetchPurchaseOrder(poId) {
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('*, vendors(*), buyers(*), delivery_addresses(*)')
    .eq('id', poId)
    .single();
  if (poError) throw poError;

  const { data: lineItems, error: liError } = await supabase
    .from('po_line_items')
    .select('*')
    .eq('purchase_order_id', poId)
    .order('line_number');
  if (liError) throw liError;

  return { ...po, line_items: lineItems };
}

// ─── Create PO with line items (transaction via RPC or sequential) ─
export async function createPurchaseOrder(po, lineItems) {
  // Get next PO number
  const { data: seqData, error: seqError } = await supabase
    .rpc('next_sequence', {
      p_company_id: po.company_id,
      p_document_type: 'purchase_order',
    });
  if (seqError) throw seqError;

  const poNumber = seqData;

  // Insert PO
  const { data: newPo, error: poError } = await supabase
    .from('purchase_orders')
    .insert({ ...po, po_number: poNumber })
    .select()
    .single();
  if (poError) throw poError;

  // Insert line items
  if (lineItems?.length) {
    const lines = lineItems.map((li, idx) => ({
      ...li,
      purchase_order_id: newPo.id,
      line_number: idx + 1,
    }));
    const { error: liError } = await supabase
      .from('po_line_items')
      .insert(lines);
    if (liError) throw liError;
  }

  return fetchPurchaseOrder(newPo.id);
}

// ─── Update PO + replace line items ──────────────────────
export async function updatePurchaseOrder(poId, updates, lineItems) {
  const { error: poError } = await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', poId);
  if (poError) throw poError;

  if (lineItems) {
    // Delete existing line items
    const { error: delError } = await supabase
      .from('po_line_items')
      .delete()
      .eq('purchase_order_id', poId);
    if (delError) throw delError;

    // Re-insert
    if (lineItems.length) {
      const lines = lineItems.map((li, idx) => ({
        ...li,
        purchase_order_id: poId,
        line_number: idx + 1,
      }));
      const { error: liError } = await supabase
        .from('po_line_items')
        .insert(lines);
      if (liError) throw liError;
    }
  }

  return fetchPurchaseOrder(poId);
}

// ─── Update PO status ────────────────────────────────────
export async function updatePurchaseOrderStatus(poId, status) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ status })
    .eq('id', poId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── PO Line Item Calculations ───────────────────────────
// Matches reference: lineAmount = qty * price * (1 - discount/100)
export function calcLineAmount(qty, price, discount = 0) {
  return parseFloat((qty * price * (1 - discount / 100)).toFixed(2));
}

// subtotal = SUM(line amounts)
// discountAmount = subtotal * overall_discount / 100
// tax = (subtotal - discountAmount) * tax_rate / 100
// total = subtotal - discountAmount + tax + extra_charges
export function calcPOTotals(lineItems, { overallDiscount = 0, taxRate = 0, extraCharges = 0 } = {}) {
  const subtotal = lineItems.reduce((sum, li) => {
    const amt = calcLineAmount(
      parseFloat(li.qty) || 0,
      parseFloat(li.price) || 0,
      parseFloat(li.discount) || 0
    );
    return sum + amt;
  }, 0);

  const discountAmount = parseFloat((subtotal * overallDiscount / 100).toFixed(2));
  const taxableAmount = subtotal - discountAmount;
  const tax = parseFloat((taxableAmount * taxRate / 100).toFixed(2));
  const total = parseFloat((taxableAmount + tax + (parseFloat(extraCharges) || 0)).toFixed(2));

  return { subtotal, discountAmount, taxableAmount, tax, total };
}
