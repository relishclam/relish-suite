import { supabase } from './supabase';

// ─── Write audit log entry ───────────────────────────────
export async function writeAuditLog({ companyId, action, tableName, recordId, oldData, newData }) {
  const { error } = await supabase
    .from('audit_log')
    .insert({
      company_id: companyId,
      action,
      table_name: tableName,
      record_id: recordId,
      old_data: oldData || null,
      new_data: newData || null,
    });
  if (error) console.error('Audit log write failed:', error);
}

// ─── Read audit log for a company ────────────────────────
export async function fetchAuditLog(companyId, { tableName, limit = 100, offset = 0 } = {}) {
  let query = supabase
    .from('audit_log')
    .select('*, profiles(full_name)', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tableName) query = query.eq('table_name', tableName);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}
