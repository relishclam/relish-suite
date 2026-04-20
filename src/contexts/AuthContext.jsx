import { createContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActiveCompanyState] = useState(null);
  const [loading, setLoading] = useState(true);

  // ─── Fetch profile + companies for a user ──────────────
  const fetchUserData = useCallback(async (userId) => {
    if (!supabase) return;
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, is_active')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      if (!profileData.is_active) {
        await supabase.auth.signOut();
        return;
      }

      setProfile(profileData);

      // Fetch companies the user has access to
      let companyData = [];
      if (profileData.role === 'super_admin') {
        // super_admin sees all companies
        const { data, error } = await supabase
          .from('companies')
          .select('id, name, short_name, gstin, address')
          .eq('is_active', true)
          .order('short_name');
        if (error) throw error;
        companyData = data || [];
      } else {
        // Other roles see only assigned companies
        const { data, error } = await supabase
          .from('user_companies')
          .select('company_id, companies(id, name, short_name, gstin, address)')
          .eq('user_id', userId);
        if (error) throw error;
        companyData = (data || [])
          .map((uc) => uc.companies)
          .filter(Boolean);
      }

      setCompanies(companyData);

      // Restore last active company from localStorage, or default to first
      const savedCompanyId = localStorage.getItem('relish_active_company');
      const savedCompany = companyData.find((c) => c.id === savedCompanyId);
      setActiveCompanyState(savedCompany || companyData[0] || null);
    } catch (err) {
      console.error('Failed to fetch user data:', err);
      setProfile(null);
      setCompanies([]);
      setActiveCompanyState(null);
    }
  }, []);

  // ─── Set active company + persist to localStorage ──────
  const setActiveCompany = useCallback((company) => {
    setActiveCompanyState(company);
    if (company?.id) {
      localStorage.setItem('relish_active_company', company.id);
    } else {
      localStorage.removeItem('relish_active_company');
    }
  }, []);

  // ─── Sign in with email + password ─────────────────────
  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  // ─── Sign out ──────────────────────────────────────────
  const signOut = useCallback(async () => {
    localStorage.removeItem('relish_active_company');
    if (!supabase) {
      setSession(null); setUser(null); setProfile(null);
      setCompanies([]); setActiveCompanyState(null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setUser(null);
    setProfile(null);
    setCompanies([]);
    setActiveCompanyState(null);
  }, []);

  // ─── Role check helpers ────────────────────────────────
  const hasRole = useCallback(
    (roles) => {
      if (!profile) return false;
      const roleList = Array.isArray(roles) ? roles : [roles];
      return roleList.includes(profile.role);
    },
    [profile]
  );

  const isSuperAdmin = useCallback(() => {
    return profile?.role === 'super_admin';
  }, [profile]);

  const hasCompanyAccess = useCallback(
    (companyId) => {
      if (!profile) return false;
      if (profile.role === 'super_admin') return true;
      return companies.some((c) => c.id === companyId);
    },
    [profile, companies]
  );

  // ClamFlow is RHHF-only: visible to super_admin or users with rhhf access
  const canAccessClamFlow = useCallback(() => {
    if (!profile) return false;
    if (profile.role === 'super_admin') return true;
    return companies.some((c) => c.id === 'rhhf');
  }, [profile, companies]);

  // ─── Initialize auth session ───────────────────────────
  useEffect(() => {
    let mounted = true;

    // Get initial session
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        fetchUserData(initialSession.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        fetchUserData(newSession.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setProfile(null);
        setCompanies([]);
        setActiveCompanyState(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const value = {
    session,
    user,
    profile,
    companies,
    activeCompany,
    setActiveCompany,
    loading,
    signIn,
    signOut,
    hasRole,
    isSuperAdmin,
    hasCompanyAccess,
    canAccessClamFlow,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
