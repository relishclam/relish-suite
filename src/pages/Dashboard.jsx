import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import logoApprovals from '../assets/logo-approvals.png';
import logoClamFlow from '../assets/logo-clamflow.png';
import logoDocs from '../assets/Docs_Logo.png';
import logoSettings from '../assets/Settings_Logo.png';

const TABS = [
  {
    id: 'docs',
    label: 'Relish Docs',
    desc: 'Purchase Orders & Invoices',
    logo: logoDocs,
    links: [
      { to: '/purchase-orders', label: 'Purchase Orders', icon: '📋', desc: 'Create and manage POs' },
      { to: '/invoices', label: 'Invoices', icon: '📄', desc: 'Proforma & commercial invoices' },
    ],
  },
  {
    id: 'settings',
    label: 'Relish Settings',
    desc: 'Tools & configurations',
    logo: logoSettings,
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
  // null = all collapsed; click same tab to collapse, different tab to switch
  const [openTab, setOpenTab] = useState(null);

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

  const handleTabClick = (id) => setOpenTab((prev) => (prev === id ? null : id));

  const openLinks = openTab ? filterLinks(visibleTabs.find((t) => t.id === openTab)?.links ?? []) : [];

  return (
    <div className="dash-page">
      <div className="dash-page__header">
        <h1 className="dash-page__title">Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}</h1>
        {activeCompany && <p className="text-muted">{activeCompany.name} ({activeCompany.short_name})</p>}
      </div>

      {/* Tab cards with logos — click to expand/collapse */}
      <div className="dash-tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dash-tab${openTab === tab.id ? ' dash-tab--active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            aria-expanded={openTab === tab.id}
          >
            <img src={tab.logo} alt={tab.label} className="dash-tab__logo" />
            <span className="dash-tab__desc">{tab.desc} {openTab === tab.id ? '▲' : '▼'}</span>
          </button>
        ))}
      </div>

      {/* Collapsible panel */}
      {openTab && openLinks.length > 0 && (
        <div className="dash-tab-panel">
          <div className="dash-grid">
            {openLinks.map((link) => (
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
