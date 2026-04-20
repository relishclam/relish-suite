// Approvals DB — READ ONLY — .select() ONLY, ZERO writes, ZERO schema changes
// Owns: Payment vouchers (managed by relishapprovals app)
// Suite reads: approved vouchers for Tally export
// NEVER insert, update, delete, or alter any table in this database
import { createClient } from '@supabase/supabase-js';

const approvalsUrl = import.meta.env.VITE_APPROVALS_SUPABASE_URL;
const approvalsAnonKey = import.meta.env.VITE_APPROVALS_SUPABASE_ANON_KEY;

if (!approvalsUrl || !approvalsAnonKey) {
  console.warn('Approvals Supabase credentials missing — Tally export will be unavailable');
}

export const supabaseApprovals = approvalsUrl && approvalsAnonKey
  ? createClient(approvalsUrl, approvalsAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;
