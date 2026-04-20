import { supabase } from './supabase';

// ─── List invoices for a company ─────────────────────────
export async function fetchInvoices(companyId, { status, invoiceType, search = '', limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('invoices')
    .select('*, buyers(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (invoiceType) query = query.eq('invoice_type', invoiceType);
  if (search) query = query.ilike('invoice_number', `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

// ─── Get single invoice with line items + packing lines ──
export async function fetchInvoice(invoiceId) {
  const { data: inv, error: invError } = await supabase
    .from('invoices')
    .select('*, buyers(*), delivery_addresses(*)')
    .eq('id', invoiceId)
    .single();
  if (invError) throw invError;

  const { data: lineItems, error: liError } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('line_number');
  if (liError) throw liError;

  const { data: packingLines, error: plError } = await supabase
    .from('invoice_packing_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('line_number');
  if (plError) throw plError;

  return { ...inv, line_items: lineItems, packing_lines: packingLines };
}

// ─── Create invoice with line items + packing lines ──────
export async function createInvoice(invoice, lineItems, packingLines = []) {
  // Determine sequence type from invoice_type
  const docType = invoice.invoice_type === 'proforma' ? 'proforma_invoice' : 'commercial_invoice';

  const { data: seqData, error: seqError } = await supabase
    .rpc('next_sequence', {
      p_company_id: invoice.company_id,
      p_document_type: docType,
    });
  if (seqError) throw seqError;

  const invoiceNumber = seqData;

  // Insert invoice
  const { data: newInv, error: invError } = await supabase
    .from('invoices')
    .insert({ ...invoice, invoice_number: invoiceNumber })
    .select()
    .single();
  if (invError) throw invError;

  // Insert line items
  if (lineItems?.length) {
    const lines = lineItems.map((li, idx) => ({
      ...li,
      invoice_id: newInv.id,
      line_number: idx + 1,
    }));
    const { error: liError } = await supabase
      .from('invoice_line_items')
      .insert(lines);
    if (liError) throw liError;
  }

  // Insert packing lines (commercial invoices only)
  if (packingLines?.length) {
    const pLines = packingLines.map((pl, idx) => ({
      ...pl,
      invoice_id: newInv.id,
      line_number: idx + 1,
    }));
    const { error: plError } = await supabase
      .from('invoice_packing_lines')
      .insert(pLines);
    if (plError) throw plError;
  }

  return fetchInvoice(newInv.id);
}

// ─── Update invoice + replace line items + packing lines ─
export async function updateInvoice(invoiceId, updates, lineItems, packingLines) {
  const { error: invError } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', invoiceId);
  if (invError) throw invError;

  if (lineItems) {
    const { error: delLi } = await supabase
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
        .from('invoice_line_items')
        .insert(lines);
      if (liError) throw liError;
    }
  }

  if (packingLines) {
    const { error: delPl } = await supabase
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
        .from('invoice_packing_lines')
        .insert(pLines);
      if (plError) throw plError;
    }
  }

  return fetchInvoice(invoiceId);
}

// ─── Update invoice status ───────────────────────────────
export async function updateInvoiceStatus(invoiceId, status) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('id', invoiceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Invoice Line Item Calculations ──────────────────────
// Matches reference: lineAmount = qty * rate (NO per-line discount)
export function calcInvoiceLineAmount(qty, rate) {
  return parseFloat((qty * rate).toFixed(2));
}

// subtotal = SUM(line amounts)
// tax = subtotal * tax_rate / 100
// total = subtotal + tax + extra_charges
export function calcInvoiceTotals(lineItems, { taxRate = 0, extraCharges = 0 } = {}) {
  const subtotal = lineItems.reduce((sum, li) => {
    const amt = calcInvoiceLineAmount(
      parseFloat(li.qty) || 0,
      parseFloat(li.rate) || 0
    );
    return sum + amt;
  }, 0);

  const tax = parseFloat((subtotal * taxRate / 100).toFixed(2));
  const total = parseFloat((subtotal + tax + (parseFloat(extraCharges) || 0)).toFixed(2));

  return { subtotal, tax, total };
}
