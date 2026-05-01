import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import logoApprovals from '../assets/logo-approvals.png';
import logoClamFlow from '../assets/logo-clamflow.png';

const TABS = [
  {
    id: 'docs',
    label: 'Relish Docs',
    desc: 'Purchase Orders & Invoices',
    icon: '📑',
    links: [
      { to: '/purchase-orders', label: 'Purchase Orders', icon: '📋', desc: 'Create and manage POs' },
      { to: '/invoices', label: 'Invoices', icon: '📄', desc: 'Proforma & commercial invoices' },
    ],
  },
  {
    id: 'settings',
    label: 'Relish Settings',
    desc: 'Tools & configurations',
    icon: '⚙️',
    links: [
      { to: '/tally-export', label: 'Tally Export', icon: '💼', desc: 'Export vouchers to Tally', roles: ['super_admin', 'admin', 'accounts'] },
      { to: '/master-data', label: 'Master Data', icon: '🗂️', desc: 'Vendors, buyers, products' },
      { to: '/admin/users', label: 'User Management', icon: '👥', desc: 'Manage users & access', roles: ['super_admin'] },
      { to: '/settings', label: 'Settings', icon: '⚙️', desc: 'Your account preferences' },
    ],
  },
];

// External app shortcuts — read-only links, no data written to these apps
const EXTERNAL_APPS = [
  {
    href: 'https://relishvoucher.vercel.app/',
    label: 'Relish Approvals',
    desc: 'Payment voucher approvals',
    logo: logoApprovals,
    roles: ['super_admin', 'admin', 'accounts'],
  },
  {
    href: 'https://clamflowcloud.vercel.app/login',
    label: 'ClamFlow',
    desc: 'Processing plant operations',
    logo: logoClamFlow,
    requiresClamFlow: true,
  },
];

export default function Dashboard() {
  const { profile, activeCompany, canAccessClamFlow } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('docs');

  const filterLinks = (links) =>
    links.filter((l) => {
      if (!l.roles) return true;
      return l.roles.includes(profile?.role);
    });

  const visibleTabs = TABS.filter((tab) => filterLinks(tab.links).length > 0);

  const visibleExternal = EXTERNAL_APPS.filter((app) => {
    if (app.requiresClamFlow) return canAccessClamFlow();
    if (app.roles) return app.roles.includes(profile?.role);
    return true;
  });

  const currentTab = visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0];
  const currentLinks = currentTab ? filterLinks(currentTab.links) : [];

  return (
    <div className="dash-page">
      <div className="dash-page__header">
        <h1 className="dash-page__title">Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}</h1>
        {activeCompany && <p className="text-muted">{activeCompany.name} ({activeCompany.short_name})</p>}
      </div>

      {/* Tab headers — styled like external app cards */}
      <div className="dash-tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dash-tab${currentTab?.id === tab.id ? ' dash-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="dash-tab__icon">{tab.icon}</span>
            <span className="dash-tab__label">{tab.label}</span>
            <span className="dash-tab__desc">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {currentLinks.length > 0 && (
        <div className="dash-tab-panel">
          <div className="dash-grid">
            {currentLinks.map((link) => (
              <button key={link.to} type="button" className="dash-card" onClick={() => navigate(link.to)}>
                <span className="dash-card__icon">{link.icon}</span>
                <span className="dash-card__label">{link.label}</span>
                <span className="dash-card__desc">{link.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {visibleExternal.length > 0 && (
        <>
          <p className="dash-section-label">Other Apps</p>
          <div className="dash-grid">
            {visibleExternal.map((app) => (
              <a
                key={app.href}
                href={app.href}
                target="_blank"
                rel="noopener noreferrer"
                className="dash-card dash-card--external"
              >
                <img src={app.logo} alt={app.label} className="dash-card__app-logo" />
                <span className="dash-card__desc">{app.desc} ↗</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
