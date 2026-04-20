import { supabase } from './supabase';
import { supabaseApprovals } from './supabaseApprovals';

// Map Suite company IDs to Approvals company IDs
const APPROVALS_COMPANY_MAP = {
  rhhf: 'relish-hhc',
  rfpl: 'relish-foods',
};

// ─── Read approved vouchers from Approvals DB ────────────
// READ ONLY — .select() ONLY — ZERO writes to Approvals DB
export async function fetchApprovedVouchers(companyId, { from, to, limit = 200 } = {}) {
  if (!supabaseApprovals) throw new Error('Approvals database not configured');

  const approvalsCompanyId = APPROVALS_COMPANY_MAP[companyId];
  if (!approvalsCompanyId) throw new Error(`No Approvals mapping for company: ${companyId}`);

  let query = supabaseApprovals
    .from('vouchers')
    .select(`
      id, company_id, serial_number, head_of_account, sub_head_of_account,
      narration, amount, payment_mode, status,
      approved_at, completed_at, created_at, narration_items, invoice_reference,
      payees ( id, name, mobile, bank_account )
    `)
    .eq('company_id', approvalsCompanyId)
    .in('status', ['approved', 'completed'])
    .order('approved_at', { ascending: false })
    .limit(limit);

  if (from) query = query.gte('approved_at', from);
  if (to) query = query.lte('approved_at', to);

  const { data, error } = await query;
  if (error) throw error;

  // Flatten payee name onto each voucher
  return (data || []).map((v) => ({
    ...v,
    payee_name: v.payees?.name || '—',
    payee_mobile: v.payees?.mobile || '',
  }));
}

// ─── Fetch voucher IDs already exported for this company ─
export async function fetchExportedVoucherIds(companyId) {
  const { data, error } = await supabase
    .from('tally_exports')
    .select('voucher_id, exported_at')
    .eq('company_id', companyId)
    .in('export_status', ['exported', 're-exported']);
  if (error) throw error;
  const map = {};
  (data || []).forEach((r) => { map[r.voucher_id] = r.exported_at; });
  return map;
}

// ─── List tally exports for a company ────────────────────
export async function fetchTallyExports(companyId, { limit = 100, offset = 0 } = {}) {
  const { data, error, count } = await supabase
    .from('tally_exports')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('exported_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data, count };
}

// ─── Create batch of tally export records ────────────────
export async function createBatchExport(records) {
  const { data, error } = await supabase
    .from('tally_exports')
    .insert(records)
    .select();
  if (error) throw error;
  return data;
}

// ─── Create tally export record ──────────────────────────
export async function createTallyExport(exportRecord) {
  const { data, error } = await supabase
    .from('tally_exports')
    .insert(exportRecord)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Update tally export (e.g., mark as synced) ──────────
export async function updateTallyExport(exportId, updates) {
  const { data, error } = await supabase
    .from('tally_exports')
    .update(updates)
    .eq('id', exportId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
