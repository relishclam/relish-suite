import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import relishLogo from '../../assets/relish-logo.png';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: '📋' },
  { to: '/invoices', label: 'Invoices', icon: '📄' },
  { to: '/tally-export', label: 'Tally Export', icon: '💼', roles: ['super_admin', 'admin', 'accounts'] },
  { to: '/master-data', label: 'Master Data', icon: '🗂️' },
  { to: '/admin/users', label: 'User Management', icon: '👥', roles: ['super_admin'] },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar({ collapsed, mobileOpen, onToggle, onMobileClose }) {
  const { profile } = useAuth();
  const location = useLocation();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(profile?.role);
  });

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}${mobileOpen ? ' sidebar--mobile-open' : ''}`}>
      {/* Logo + Brand */}
      <div className="sidebar__brand">
        <img src={relishLogo} alt="Relish" className="sidebar__logo" />
        {!collapsed && <span className="sidebar__title">Relish Suite</span>}
        <button
          className="sidebar__toggle btn-ghost"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar__nav">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar__link${isActive || location.pathname.startsWith(item.to) ? ' sidebar__link--active' : ''}`
            }
            title={collapsed ? item.label : undefined}
            onClick={onMobileClose}
          >
            <span className="sidebar__icon">{item.icon}</span>
            {!collapsed && <span className="sidebar__label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
