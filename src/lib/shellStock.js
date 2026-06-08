import { supabase } from './supabase';

// direction is auto-derived from entry_type by convention:
//   receipt     → in
//   consumption → out
//   sale        → out
//   adjustment  → caller supplies direction explicitly
export function directionFor(entryType, explicitDirection) {
  if (entryType === 'receipt')     return 'in';
  if (entryType === 'consumption') return 'out';
  if (entryType === 'sale')        return 'out';
  return explicitDirection || 'in'; // adjustment
}

// ─── Fetch all entries for a company ─────────────────────────────
export async function fetchShellStock(companyId, { limit = 300, offset = 0 } = {}) {
  const { data, error, count } = await supabase
    .schema('suite')
    .from('shell_stock')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data, count };
}

// ─── Create a new stock entry ─────────────────────────────────────
export async function createShellEntry(entry) {
  const id = crypto.randomUUID();
  const { error } = await supabase
    .schema('suite')
    .from('shell_stock')
    .insert({ id, ...entry });
  if (error) throw error;
  return id;
}

// ─── Update an existing entry ─────────────────────────────────────
export async function updateShellEntry(id, updates) {
  const { error } = await supabase
    .schema('suite')
    .from('shell_stock')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── Delete an entry ──────────────────────────────────────────────
export async function deleteShellEntry(id) {
  const { error } = await supabase
    .schema('suite')
    .from('shell_stock')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
