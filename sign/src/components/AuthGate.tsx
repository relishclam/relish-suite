import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { checkRelishMembership, getSession } from '../lib/auth';

/**
 * Wraps all protected routes. Verifies Supabase session AND Relish Group
 * membership on every app open — not just first launch.
 */
export default function AuthGate() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    async function check() {
      const session = await getSession();
      if (!session) {
        navigate('/login', { replace: true });
        return;
      }

      const isMember = await checkRelishMembership();
      if (!isMember) {
        setDenied(true);
        setChecking(false);
        return;
      }

      setChecking(false);
    }
    check();
  }, [navigate]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-relish-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
        <img src="/Relish-Logo.png" alt="Relish" className="h-12 mb-6" />
        <h1 className="text-xl font-bold text-relish-purple mb-3">Access Denied</h1>
        <p className="text-gray-600 text-sm leading-relaxed">
          You are not authorised to use Relish Sign.
          <br />
          Contact your Relish Group administrator.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
