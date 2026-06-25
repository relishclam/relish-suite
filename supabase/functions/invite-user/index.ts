// invite-user/index.ts
// Supabase Edge Function — runs server-side with service_role key.
// Called by Suite UserManagement when an admin invites a new user.
//
// POST body: { email, fullName, companyId, role }
// role must be one of: admin | accounts | auditor
//
// Steps:
//   1. Verify caller is super_admin or admin via their JWT.
//   2. Call auth.admin.inviteUserByEmail → creates auth.users row + sends
//      invite email with redirectTo pointing to /set-password.
//   3. Upsert registry.profiles (trigger may have fired already — safe).
//   4. Insert registry.company_users with the chosen role.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUITE_SET_PASSWORD_URL = 'https://relishsuite.vercel.app/set-password'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabaseUrl   = Deno.env.get('SUPABASE_URL')!
    const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey       = Deno.env.get('SUPABASE_ANON_KEY')!

    // Admin client: uses service_role key (bypasses RLS)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Caller client: verifies the calling user's JWT
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // ── Verify caller identity ───────────────────────────────────
    const { data: { user: callerUser }, error: authErr } = await caller.auth.getUser()
    if (authErr || !callerUser) return json({ error: 'Unauthorized' }, 401)

    // Must be super_admin OR hold admin role in at least one company
    const { data: profile } = await admin
      .schema('registry')
      .from('profiles')
      .select('is_super_admin')
      .eq('id', callerUser.id)
      .single()

    if (!profile?.is_super_admin) {
      const { data: adminCu } = await admin
        .schema('registry')
        .from('company_users')
        .select('id')
        .eq('user_id', callerUser.id)
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle()

      if (!adminCu) return json({ error: 'Forbidden: admin or super_admin required' }, 403)
    }

    // ── Validate body ────────────────────────────────────────────
    const { email, fullName, companyId, role } = await req.json()

    if (!email || !companyId || !role) {
      return json({ error: 'email, companyId and role are required' }, 400)
    }

    const validRoles = ['admin', 'accounts', 'auditor']
    if (!validRoles.includes(role)) {
      return json({ error: 'role must be admin, accounts, or auditor' }, 400)
    }

    // ── Invite user ──────────────────────────────────────────────
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: SUITE_SET_PASSWORD_URL,
      data: { full_name: fullName ?? '' },
    })

    if (inviteErr) return json({ error: inviteErr.message }, 400)

    const userId = inviteData.user.id

    // ── Upsert profile ───────────────────────────────────────────
    // The on_auth_user_created trigger fires immediately after invite and
    // inserts a profile row. We upsert here to set full_name correctly.
    const { error: profileErr } = await admin
      .schema('registry')
      .from('profiles')
      .upsert({
        id:             userId,
        email:          email.trim().toLowerCase(),
        full_name:      fullName?.trim() ?? '',
        is_active:      true,
        is_super_admin: false,
      }, { onConflict: 'id' })

    if (profileErr) return json({ error: `Profile error: ${profileErr.message}` }, 500)

    // ── Create company_users row ─────────────────────────────────
    const { error: cuErr } = await admin
      .schema('registry')
      .from('company_users')
      .insert({ user_id: userId, company_id: companyId, role })

    if (cuErr) return json({ error: `Company assignment error: ${cuErr.message}` }, 500)

    return json({ success: true, userId })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
