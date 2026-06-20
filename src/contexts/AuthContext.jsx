import { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getPermissions } from '../lib/permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession]                  = useState(null);
  const [user, setUser]                        = useState(null);
  const [profile, setProfile]                  = useState(null);
  const [companyUsers, setCompanyUsers]        = useState([]);
  const [activeCompany, setActiveCompanyState] = useState(null);
  const [loading, setLoading]                  = useState(true);

  // ─── Derived: companies array (backward compat — Header + ProtectedRoute)
  const companies = useMemo(
    () => companyUsers.map((cu) => cu.company).filter(Boolean),
    [companyUsers]
  );

  // ─── Derived: active role
  // profile.is_super_admin = true  → synthetic 'super_admin' (all permissions)
  // otherwise                      → role from matching company_users row
  const activeRole = useMemo(() => {
    if (!profile) return null;
    if (profile.is_super_admin) return 'super_admin';
    const activeCu = companyUsers.find((cu) => cu.company_id === activeCompany?.id);
    return activeCu?.role ?? null;
  }, [profile, companyUsers, activeCompany]);

  // ─── Derived: permission object
  const permissions = useMemo(() => getPermissions(activeRole), [activeRole]);

  // ─── Fetch profile + company assignments ────────────────────────
  const fetchUserData = useCallback(async (userId) => {
    if (!supabase) return;
    try {
      // 1. App access check
      const { data: accessRow } = await supabase
        .schema('registry')
        .from('app_access')
        .select('can_access')
        .eq('user_id', userId)
        .eq('app', 'suite')
        .maybeSingle();

      if (accessRow && accessRow.can_access === false) {
        await supabase.auth.signOut();
        return;
      }

      // 2. Fetch registry.profiles (no role column)
      const { data: profileData, error: profileError } = await supabase
        .schema('registry')
        .from('profiles')
        .select('id, full_name, email, mobile, is_super_admin, is_active, entity_id')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      if (!profileData.is_active) {
        await supabase.auth.signOut();
        return;
      }
      setProfile(profileData);

      // 3a. Fetch company_users (no FK join — fetch companies separately)
      const { data: cuData, error: cuError } = await supabase
        .schema('registry')
        .from('company_users')
        .select('id, user_id, company_id, role, is_primary')
        .eq('user_id', userId);

      if (cuError) throw cuError;

      // 3b. Fetch company rows for those company_ids
      const companyIds = (cuData || []).map((cu) => cu.company_id);
      let companyMap = {};
      if (companyIds.length > 0) {
        const { data: coData, error: coError } = await supabase
          .schema('registry')
          .from('companies')
          .select('id, code, name, short_name, gstin, is_active')
          .in('id', companyIds);
        if (coError) throw coError;
        (coData || []).forEach((c) => { companyMap[c.id] = c; });
      }

      // 3c. Merge and filter to active companies only
      const enriched   = (cuData || []).map((cu) => ({ ...cu, company: companyMap[cu.company_id] ?? null }));
      const activeRows = enriched.filter((cu) => cu.company?.is_active);

      // 4. Restore active company: saved → primary → first
      const savedId   = localStorage.getItem('relish_active_company');
      const allCos    = activeRows.map((cu) => cu.company).filter(Boolean);
      const savedCo   = allCos.find((c) => c.id === savedId);
      const primaryCu = activeRows.find((cu) => cu.is_primary);
      const resolvedCo = savedCo ?? primaryCu?.company ?? allCos[0] ?? null;

      // Batch all derived state in one synchronous pass to avoid intermediate renders
      setCompanyUsers(activeRows);
      setActiveCompanyState(resolvedCo);

    } catch (err) {
      console.error('AuthContext: fetchUserData failed', err);
      setProfile(null);
      setCompanyUsers([]);
      setActiveCompanyState(null);
    }
  }, []);

  // ─── Set active company + persist ───────────────────────────────
  const setActiveCompany = useCallback((company) => {
    setActiveCompanyState(company);
    if (company?.id) {
      localStorage.setItem('relish_active_company', company.id);
    } else {
      localStorage.removeItem('relish_active_company');
    }
  }, []);

  // ─── Sign in ─────────────────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  // ─── Sign out ────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    localStorage.removeItem('relish_active_company');
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    setCompanyUsers([]);
    setActiveCompanyState(null);
  }, []);

  // ─── Auth session listener ───────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session: init } }) => {
      if (!mounted) return;
      setSession(init);
      setUser(init?.user ?? null);
      if (init?.user) {
        fetchUserData(init.user.id).finally(() => { if (mounted) setLoading(false); });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);
      if (next?.user) {
        // Do NOT set loading=true here — doing so unmounts the current page
        // component (ProtectedRoute shows a spinner) and destroys all form
        // state. Token refreshes (TOKEN_REFRESHED) fire every time the tab
        // regains focus; user data can be refreshed silently in the background.
        fetchUserData(next.user.id);
      } else {
        setProfile(null);
        setCompanyUsers([]);
        setActiveCompanyState(null);
        setLoading(false);
      }
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [fetchUserData]);

  const value = {
    // Raw auth
    session,
    user,
    // Registry data
    profile,          // registry.profiles row — no role column
    companyUsers,     // registry.company_users[] with company joined
    companies,        // derived array of company objects — backward compat
    activeCompany,
    activeRole,       // 'super_admin' | 'admin' | 'accounts' | ... | null
    setActiveCompany,
    permissions,      // getPermissions(activeRole) result object
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
