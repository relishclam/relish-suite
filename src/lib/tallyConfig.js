import { supabase } from './supabase';

// ─── Get tally config for a company ──────────────────────
export async function fetchTallyConfig(companyId) {
  const { data, error } = await supabase
    .schema('suite')
    .from('tally_config')
    .select('*')
    .eq('company_id', companyId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

// ─── Create or update tally config ───────────────────────
export async function upsertTallyConfig(config) {
  const { error } = await supabase
    .schema('suite')
    .from('tally_config')
    .upsert(config, { onConflict: 'company_id' });
  if (error) throw error;
}
