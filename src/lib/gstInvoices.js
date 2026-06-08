import { supabase } from './supabase';

// ─── Fetch all GST lease invoices for a company ──────────
export async function fetchGSTInvoices(companyId, { limit = 50, offset = 0 } = {}) {
  const { data, error, count } = await supabase
    .schema('suite')
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .eq('doc_type', 'gst_lease')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data, count };
}

// ─── Fetch single GST invoice with line items ────────────
export async function fetchGSTInvoice(invoiceId) {
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

  return { ...inv, line_items: lineItems };
}

// ─── Create GST invoice with line items ──────────────────
export async function createGSTInvoice(invoice, lineItems, company) {
  const { data: invoiceNumber, error: seqError } = await supabase
    .schema('registry')
    .rpc('next_cal_sequence', {
      p_company_id:   company.id,
      p_company_code: company.code,
      p_prefix:       'GSTI',
    });
  if (seqError) throw seqError;

  const invoiceId = crypto.randomUUID();
  const { error: invError } = await supabase
    .schema('suite')
    .from('invoices')
    .insert({ id: invoiceId, ...invoice, invoice_number: invoiceNumber, doc_type: 'gst_lease' });
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

  return fetchGSTInvoice(invoiceId);
}

// ─── Update GST invoice ───────────────────────────────────
export async function updateGSTInvoice(invoiceId, updates, lineItems) {
  const { error: invError } = await supabase
    .schema('suite')
    .from('invoices')
    .update(updates)
    .eq('id', invoiceId);
  if (invError) throw invError;

  if (lineItems) {
    const { error: delError } = await supabase
      .schema('suite')
      .from('invoice_line_items')
      .delete()
      .eq('invoice_id', invoiceId);
    if (delError) throw delError;

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

  return fetchGSTInvoice(invoiceId);
}
