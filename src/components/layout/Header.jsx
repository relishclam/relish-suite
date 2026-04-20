import { useAuth } from '../../hooks/useAuth';
import useOnlineStatus from '../../hooks/useOnlineStatus';

export default function Header({ onMenuToggle }) {
  const { profile, companies, activeCompany, setActiveCompany, signOut } = useAuth();
  const isOnline = useOnlineStatus();

  const handleCompanyChange = (e) => {
    const selected = companies.find((c) => c.id === e.target.value);
    if (selected) setActiveCompany(selected);
  };

  return (
    <header className="app-header">
      {/* Offline banner */}
      {!isOnline && (
        <div className="offline-banner">
          You are offline — changes will sync when connection is restored
        </div>
      )}

      <div className="app-header__inner">
        {/* Mobile hamburger */}
        <button className="btn-ghost app-header__hamburger" onClick={onMenuToggle} aria-label="Toggle menu">
          ☰
        </button>
        {/* Company switcher (only when more than one company) */}
        {companies.length > 1 && (
          <select
            className="form-select app-header__company-select"
            value={activeCompany?.id || ''}
            onChange={handleCompanyChange}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short_name}
              </option>
            ))}
          </select>
        )}

        {/* Single company — just show the name */}
        {companies.length === 1 && (
          <span className="app-header__company-name">{activeCompany?.short_name}</span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* User info + sign out */}
        <div className="app-header__user">
          <span className="app-header__user-name">
            {profile?.full_name || profile?.email || '—'}
          </span>
          <span className="app-header__user-role badge">
            {profile?.role?.replace('_', ' ')}
          </span>
          <button className="btn btn-ghost app-header__signout" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
