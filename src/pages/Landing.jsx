import { Link } from 'react-router-dom';
import relishLogo from '../assets/relish-logo.png';
import foodstreamLogo from '../assets/foodstream-logo.png';

const APP_CARDS = [
  {
    icon: '📋',
    title: 'Purchase Orders',
    desc: 'Create, manage, and track purchase orders with multi-step wizard, auto-numbering, and PDF generation.',
  },
  {
    icon: '📄',
    title: 'Invoice Generator',
    desc: 'Generate proforma and commercial invoices with packing lists, amount-in-words, and one-click PDF export.',
  },
  {
    icon: '💼',
    title: 'Tally Export',
    desc: 'Fetch approved vouchers and export XML files ready for Tally ERP import — zero manual re-entry.',
  },
  {
    icon: '🗂️',
    title: 'Master Data',
    desc: 'Centralized vendor, buyer, product, and delivery address management across all group companies.',
  },
  {
    icon: '🔗',
    title: 'ClamFlow Integration',
    desc: 'Live read-only view of supplier records, onboarding status, and delivery history from the Panavally plant.',
  },
  {
    icon: '👥',
    title: 'User Management',
    desc: 'Role-based access control with company-level permissions — super admin, admin, accounts, operations, viewer.',
  },
];

const ENTITIES = [
  {
    short: 'RHHF',
    name: 'Relish Hao Hao Chi Foods',
    address: '26/599, M.O.Ward, Alappuzha, Kerala 688001',
    gstin: '32AAUFR0742E1ZB',
  },
  {
    short: 'RFPL',
    name: 'Relish Foods Pvt Ltd',
    address: '179 B, Madhavapuram, Kanyakumari, Tamil Nadu 629704',
    gstin: '33AAACR7749E2ZD',
  },
];

export default function Landing() {
  return (
    <div className="landing">
      {/* ─── Sticky Nav ─────────────────────── */}
      <nav className="landing__nav">
        <div className="landing__nav-inner">
          <div className="landing__brand">
            <img src={relishLogo} alt="Relish" className="landing__brand-logo" />
            <span className="landing__brand-text">Relish Business Suite</span>
          </div>
          <Link to="/login" className="btn btn-primary">
            Sign In
          </Link>
        </div>
      </nav>

      {/* ─── Hero Section ───────────────────── */}
      <section className="landing__hero">
        <h1 className="landing__hero-title">
          Internal Operations Platform
        </h1>
        <p className="landing__hero-subtitle">
          Purchase orders, invoices, Tally exports, and master data — unified for the Relish Group of Companies.
        </p>
        <Link to="/login" className="btn btn-primary landing__hero-cta">
          Get Started
        </Link>
      </section>

      {/* ─── App Cards ──────────────────────── */}
      <section className="landing__section">
        <h2 className="landing__section-title">What&apos;s Inside</h2>
        <div className="landing__cards">
          {APP_CARDS.map((card) => (
            <div key={card.title} className="landing__card card">
              <span className="landing__card-icon">{card.icon}</span>
              <h3 className="landing__card-title">{card.title}</h3>
              <p className="landing__card-desc">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Operating Entities ─────────────── */}
      <section className="landing__section landing__section--alt">
        <h2 className="landing__section-title">Operating Entities</h2>
        <div className="landing__entities">
          {ENTITIES.map((ent) => (
            <div key={ent.short} className="landing__entity card">
              <span className="landing__entity-badge">{ent.short}</span>
              <h3 className="landing__entity-name">{ent.name}</h3>
              <p className="landing__entity-address">{ent.address}</p>
              <p className="landing__entity-gstin">GSTIN: {ent.gstin}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Security Strip ─────────────────── */}
      <section className="landing__security">
        <div className="landing__security-inner">
          <span>🔒</span>
          <span>Role-based access control</span>
          <span>•</span>
          <span>Row-level security</span>
          <span>•</span>
          <span>Audit logging</span>
          <span>•</span>
          <span>Offline-capable PWA</span>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────── */}
      <footer className="landing__footer">
        <p className="landing__footer-text">
          &copy; {new Date().getFullYear()} Relish Group of Companies. All rights reserved.
        </p>
        <a
          href="https://foodstream.co"
          target="_blank"
          rel="noopener noreferrer"
          className="landing__footer-credit"
        >
          Built by{' '}
          <img
            src={foodstreamLogo}
            alt="FoodStream Ltd"
            className="landing__footer-logo"
          />
        </a>
      </footer>
    </div>
  );
}
