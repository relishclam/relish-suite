import { supabase } from './supabase';

function isMissingTallyConfigTable(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' || // postgres: relation does not exist
    code === 'PGRST205' || // postgrest: table not found in exposed schema
    (msg.includes('tally_config') && (msg.includes('not found') || msg.includes('does not exist')))
  );
}

// ─── Get tally config for a company ──────────────────────
export async function fetchTallyConfig(companyId) {
  const { data, error } = await supabase
    .schema('suite')
    .from('tally_config')
    .select('*')
    .eq('company_id', companyId)
    .single();
  if (isMissingTallyConfigTable(error)) return null;
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

// ─── Create or update tally config ───────────────────────
export async function upsertTallyConfig(config) {
  const { error } = await supabase
    .schema('suite')
    .from('tally_config')
    .upsert(config, { onConflict: 'company_id' });
  if (isMissingTallyConfigTable(error)) {
    throw new Error('Tally config storage is not initialized (suite.tally_config missing). Apply DB migration 015_create_tally_tables.sql.');
  }
  if (error) throw error;
}
