// Suite DB — READ + WRITE — Primary Supabase client
// Owns: Companies, POs, Invoices, Buyers, Products, Tally config/exports, Users
// Tables: companies, profiles, user_companies, vendors, buyers, products,
//   delivery_addresses, purchase_orders, po_line_items, invoices,
//   invoice_line_items, invoice_packing_lines, tally_config, tally_exports,
//   sequence_counters, audit_log
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Suite Supabase credentials missing — app will not function');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// ─── Document Issue Address (Head Office, Alappuzha) ────
// All POs, Proformas, and Commercial Invoices for BOTH
// companies are issued from this address. Read-only on forms.
export const ISSUE_ADDRESS = {
  line1: import.meta.env.VITE_ISSUE_ADDRESS_LINE1,
  line2: import.meta.env.VITE_ISSUE_ADDRESS_LINE2,
  country: import.meta.env.VITE_ISSUE_ADDRESS_COUNTRY,
};
