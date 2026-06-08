import { supabase } from './supabase';

// ─── List invoices for a company ─────────────────────────────────
// List view uses snapshot columns only — no cross-schema joins.
// bill_to_company is snapshotted on the invoice at create time.
export async function fetchInvoices(companyId, { status, invoiceType, search = '', limit = 50, offset = 0 } = {}) {
  let query = supabase
    .schema('suite')
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status)      query = query.eq('status', status);
  if (invoiceType) query = query.eq('doc_type', invoiceType);
  if (search)      query = query.ilike('invoice_number', `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

// ─── Get single invoice with line items + packing lines ──────────
// Fetches invoice + child tables, then separately fetches buyer entity
// if buyer_entity_id is set. Attaches as invoice.buyer_entity.
export async function fetchInvoice(invoiceId) {
  const { data: inv, error: invError } = await supabase
    .schema('suite')
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();
  if (invError) throw invError;

  const { data: lineItems, error: liError } = await supabase
    .schema('suite')
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('line_number');
  if (liError) throw liError;

  const { data: packingLines, error: plError } = await supabase
    .schema('suite')
    .from('invoice_packing_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('line_number');
  if (plError) throw plError;

  let buyerEntity = null;
  if (inv.buyer_entity_id) {
    const { data: entity } = await supabase
      .schema('registry')
      .from('entities')
      .select('*')
      .eq('id', inv.buyer_entity_id)
      .single();
    buyerEntity = entity ?? null;
  }

  return { ...inv, line_items: lineItems, packing_lines: packingLines, buyer_entity: buyerEntity };
}

// ─── Create invoice with line items + packing lines ──────────────
// company is the full activeCompany object { id, code, ... }
export async function createInvoice(invoice, lineItems, packingLines = [], company) {
  const { data: invoiceNumber, error: seqError } = await supabase
    .schema('registry')
    .rpc('next_cal_sequence', {
      p_company_id:   company.id,
      p_company_code: company.code,
      p_prefix:       'INV',
    });
  if (seqError) throw seqError;

  const invoiceId = crypto.randomUUID();
  const { error: invError } = await supabase
    .schema('suite')
    .from('invoices')
    .insert({ id: invoiceId, ...invoice, invoice_number: invoiceNumber });
  if (invError) throw invError;

  if (lineItems?.length) {
    const lines = lineItems.map((li, idx) => ({
      ...li,
      invoice_id: invoiceId,
      line_number: idx + 1,
    }));
    const { error: liError } = await supabase
      .schema('suite')
      .from('invoice_line_items')
      .insert(lines);
    if (liError) throw liError;
  }

  if (packingLines?.length) {
    const pLines = packingLines.map((pl, idx) => ({
      ...pl,
      invoice_id: invoiceId,
      line_number: idx + 1,
    }));
    const { error: plError } = await supabase
      .schema('suite')
      .from('invoice_packing_lines')
      .insert(pLines);
    if (plError) throw plError;
  }

  return fetchInvoice(invoiceId);
}

// ─── Update invoice + replace line items + packing lines ─────────
export async function updateInvoice(invoiceId, updates, lineItems, packingLines) {
  const { error: invError } = await supabase
    .schema('suite')
    .from('invoices')
    .update(updates)
    .eq('id', invoiceId);
  if (invError) throw invError;

  if (lineItems) {
    const { error: delLi } = await supabase
      .schema('suite')
      .from('invoice_line_items')
      .delete()
      .eq('invoice_id', invoiceId);
    if (delLi) throw delLi;

    if (lineItems.length) {
      const lines = lineItems.map((li, idx) => ({
        ...li,
        invoice_id: invoiceId,
        line_number: idx + 1,
      }));
      const { error: liError } = await supabase
        .schema('suite')
        .from('invoice_line_items')
        .insert(lines);
      if (liError) throw liError;
    }
  }

  if (packingLines) {
    const { error: delPl } = await supabase
      .schema('suite')
      .from('invoice_packing_lines')
      .delete()
      .eq('invoice_id', invoiceId);
    if (delPl) throw delPl;

    if (packingLines.length) {
      const pLines = packingLines.map((pl, idx) => ({
        ...pl,
        invoice_id: invoiceId,
        line_number: idx + 1,
      }));
      const { error: plError } = await supabase
        .schema('suite')
        .from('invoice_packing_lines')
        .insert(pLines);
      if (plError) throw plError;
    }
  }

  return fetchInvoice(invoiceId);
}

// ─── Update invoice status ───────────────────────────────────────
export async function updateInvoiceStatus(invoiceId, status) {
  const { data, error } = await supabase
    .schema('suite')
    .from('invoices')
    .update({ status })
    .eq('id', invoiceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Invoice Line Item Calculations ──────────────────────────────
// lineAmount = qty * rate (no per-line discount on invoices)
export function calcInvoiceLineAmount(qty, rate) {
  return parseFloat((qty * rate).toFixed(2));
}

// subtotal = SUM(line amounts)
// tax = subtotal * tax_rate / 100
// total = subtotal + tax + extra_charges
export function calcInvoiceTotals(lineItems, { taxRate = 0, extraCharges = 0 } = {}) {
  const subtotal = lineItems.reduce((sum, li) => {
    return sum + calcInvoiceLineAmount(
      parseFloat(li.qty)  || 0,
      parseFloat(li.rate) || 0
    );
  }, 0);

  const tax   = parseFloat((subtotal * taxRate / 100).toFixed(2));
  const total = parseFloat((subtotal + tax + (parseFloat(extraCharges) || 0)).toFixed(2));

  return { subtotal, tax, total };
}

