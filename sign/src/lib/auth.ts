import { supabase } from './supabase';

const RELISH_COMPANY_IDS = [
  'bc455c94-0bcd-4d66-a040-d29ed880d22f', // RFPL
  'b8beb440-df7f-48e8-a012-ac5750502eca', // RHHF
];

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

/** Returns true only if the current user belongs to RFPL or RHHF. */
export async function checkRelishMembership(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const { data, error } = await supabase
    .from('company_users')
    .select('id')
    .in('company_id', RELISH_COMPANY_IDS)
    .limit(1);

  return !error && (data?.length ?? 0) > 0;
}

/** Returns the display name of the current user from registry.profiles. */
export async function getCurrentUserName(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return '';

  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', session.user.id)
    .single();

  return data?.full_name ?? session.user.email ?? '';
}

/** Returns the active signing key for the current user, if any. */
export async function getActiveSigningKey() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('signing_keys')
    .select('*')
    .eq('user_id', session.user.id)
    .is('revoked_at', null)
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .single();

  return data ?? null;
}
