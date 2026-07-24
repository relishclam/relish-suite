import { supabase } from './supabase';

// ─── Write audit log entry ───────────────────────────────
// Map semantic caller actions to the values accepted by the DB CHECK constraint.
const ACTION_MAP = {
  create:         'INSERT',
  insert:         'INSERT',
  update:         'UPDATE',
  upsert:         'UPDATE',
  activate:       'UPDATE',
  deactivate:     'UPDATE',
  set_password:   'UPDATE',
  invite:         'INSERT',
  assign_company: 'INSERT',
  remove_company: 'DELETE',
};

export async function writeAuditLog({ companyId, schemaName = 'registry', action, tableName, recordId, oldData, newData }) {
  const dbAction = ACTION_MAP[action] ?? action.toUpperCase();
  const { error } = await supabase
    .schema('registry')
    .from('audit_log')
    .insert({
      company_id: companyId,
      schema_name: schemaName,
      action: dbAction,
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
    .schema('registry')
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tableName) query = query.eq('table_name', tableName);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}
