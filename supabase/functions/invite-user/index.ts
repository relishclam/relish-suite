// invite-user/index.ts
// Supabase Edge Function — runs server-side with service_role key.
// Called by Suite UserManagement when an admin invites a new user.
//
// POST body: { email, fullName, companyId, role, password, userId }
// role must be one of: admin | accounts | auditor
//
// Steps:
//   1. Verify caller is super_admin or admin via their JWT.
//   2. Create or re-use auth.users row and set a password.
//   3. Upsert registry.profiles (trigger may have fired already — safe).
//   4. Insert or upsert registry.company_users with the chosen role when company data is supplied.
//   5. Return the password for the admin to share.

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
    const serviceKey    = Deno.env.get('SERVICE_ROLE_KEY')!
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

    // Use caller client (authenticated role) — known to have SELECT on registry
    // Must be super_admin OR hold admin role in at least one company
    const { data: profile } = await caller
      .schema('registry')
      .from('profiles')
      .select('is_super_admin')
      .eq('id', callerUser.id)
      .single()

    if (!profile?.is_super_admin) {
      const { data: adminCu } = await caller
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
    const { email, fullName, companyId, role, password, userId: targetUserId } = await req.json()

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const normalizedFullName = typeof fullName === 'string' ? fullName.trim() : ''

    if (!normalizedEmail && !targetUserId) {
      return json({ error: 'email or userId is required' }, 400)
    }

    if ((companyId && !role) || (!companyId && role)) {
      return json({ error: 'companyId and role must be provided together' }, 400)
    }

    const validRoles = ['admin', 'accounts', 'auditor']
    if (role && !validRoles.includes(role)) {
      return json({ error: 'role must be admin, accounts, or auditor' }, 400)
    }

    // ── Create or re-use auth user and set a password ──
    let userId: string = targetUserId
    const tempPassword = password?.trim() || (Math.random().toString(36).slice(-10) + 'Aa1!')

    const { data: existingUsers, error: listErr } = await admin.auth.admin.listUsers()
    if (listErr) return json({ error: `User lookup error: ${listErr.message}` }, 500)

    const existingUser = normalizedEmail
      ? existingUsers.users.find((u) => u.email?.toLowerCase() === normalizedEmail)
      : undefined

    if (targetUserId) {
      const { data: existingById, error: lookupErr } = await admin.auth.admin.getUserById(targetUserId)
      if (lookupErr) return json({ error: `User lookup error: ${lookupErr.message}` }, 500)
      if (existingById.user) {
        userId = existingById.user.id
      }
    }

    if (existingUser) {
      userId = existingUser.id
    }

    if (userId) {
      const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: tempPassword })
      if (pwErr) return json({ error: `Password update error: ${pwErr.message}` }, 500)
    } else {
      const { data: createData, error: createErr } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: normalizedFullName },
      })

      if (createErr) return json({ error: createErr.message }, 400)
      userId = createData.user.id
    }

    // ── Upsert profile ───────────────────────────────────────────
    // The on_auth_user_created trigger fires immediately after invite and
    // inserts a profile row. We upsert here to set full_name correctly.
    const { error: profileErr } = await admin
      .schema('registry')
      .from('profiles')
      .upsert({
        id:             userId,
        email:          normalizedEmail || null,
        full_name:      normalizedFullName,
        is_active:      true,
        is_super_admin: false,
      }, { onConflict: 'id' })

    if (profileErr) return json({ error: `Profile error: ${profileErr.message}` }, 500)

    // ── Create company_users row when a company is supplied ─────
    if (companyId && role) {
      const { error: cuErr } = await admin
        .schema('registry')
        .from('company_users')
        .upsert({ user_id: userId, company_id: companyId, role }, { onConflict: 'user_id,company_id' })

      if (cuErr) return json({ error: `Company assignment error: ${cuErr.message}` }, 500)
    }

    return json({ success: true, userId, temporaryPassword: tempPassword })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
