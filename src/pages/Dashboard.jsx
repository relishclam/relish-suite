import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const QUICK_LINKS = [
  { to: '/purchase-orders', label: 'Purchase Orders', icon: '📋', desc: 'Create and manage POs' },
  { to: '/invoices', label: 'Invoices', icon: '📄', desc: 'Proforma & commercial invoices' },
  { to: '/tally-export', label: 'Tally Export', icon: '💼', desc: 'Export vouchers to Tally', roles: ['super_admin', 'admin', 'accounts'] },
  { to: '/master-data', label: 'Master Data', icon: '🗂️', desc: 'Vendors, buyers, products' },
  { to: '/admin/users', label: 'User Management', icon: '👥', desc: 'Manage users & access', roles: ['super_admin'] },
  { to: '/settings', label: 'Settings', icon: '⚙️', desc: 'Your account preferences' },
];

export default function Dashboard() {
  const { profile, activeCompany } = useAuth();
  const navigate = useNavigate();

  const visible = QUICK_LINKS.filter((l) => {
    if (!l.roles) return true;
    return l.roles.includes(profile?.role);
  });

  return (
    <div className="dash-page">
      <div className="dash-page__header">
        <h1 className="dash-page__title">Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}</h1>
        {activeCompany && <p className="text-muted">{activeCompany.name} ({activeCompany.short_name})</p>}
      </div>

      <div className="dash-grid">
        {visible.map((link) => (
          <button key={link.to} type="button" className="dash-card" onClick={() => navigate(link.to)}>
            <span className="dash-card__icon">{link.icon}</span>
            <span className="dash-card__label">{link.label}</span>
            <span className="dash-card__desc">{link.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
