// ═══════════════════════════════════════════════════════════════
// RELISH APPROVALS — READ-ONLY CONNECTION
// Project: ewbguvwrejdvlhzcqlbp (relishvoucher.vercel.app)
// This is a LIVE PRODUCTION system.
// NEVER call .insert() .update() .delete() .upsert() on this client.
// This file exists only to READ approved vouchers for Tally XML export.
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const approvalsUrl = import.meta.env.VITE_APPROVALS_SUPABASE_URL;
const approvalsAnonKey = import.meta.env.VITE_APPROVALS_SUPABASE_ANON_KEY;

if (!approvalsUrl || !approvalsAnonKey) {
  console.warn('Approvals Supabase credentials missing — Tally export will be unavailable');
}

export const supabaseApprovalsReadOnly = approvalsUrl && approvalsAnonKey
  ? createClient(approvalsUrl, approvalsAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;
