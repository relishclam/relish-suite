import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from './LoadingSpinner';

/**
 * ProtectedRoute — wraps authenticated routes.
 *
 * Props:
 *   children        — page component(s) to render
 *   roles           — optional array of allowed roles, e.g. ['super_admin','admin']
 *   requireCompany  — if true, user must have at least one company assigned (default true)
 */
export default function ProtectedRoute({ children, roles, requireCompany = true }) {
  const { user, profile, companies, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  // Not authenticated → login
  if (!user) return <Navigate to="/login" replace />;

  // Profile not loaded yet or account deactivated
  if (!profile || !profile.is_active) return <Navigate to="/login" replace />;

  // Role gate
  if (roles && roles.length > 0 && !roles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Company gate — user must be assigned to at least one company
  if (requireCompany && companies.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--navy)', marginBottom: '0.5rem' }}>
          No Company Access
        </h2>
        <p>You have not been assigned to any company yet. Please contact your administrator.</p>
      </div>
    );
  }

  return children;
}
