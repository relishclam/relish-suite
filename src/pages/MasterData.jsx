import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SlideOver from '../components/common/SlideOver';
import { fetchCompanies, fetchCompany, updateCompany } from '../lib/companies';
import { fetchVendors, createVendor, updateVendor, toggleVendorActive } from '../lib/vendors';
import { fetchBuyers, createBuyer, updateBuyer, toggleBuyerActive } from '../lib/buyers';
import { fetchProducts, createProduct, updateProduct, toggleProductActive } from '../lib/products';
import { fetchDeliveryAddresses, createDeliveryAddress, updateDeliveryAddress, toggleDeliveryAddressActive } from '../lib/deliveryAddresses';
import { fetchTallyConfig, upsertTallyConfig } from '../lib/tallyConfig';
import { fetchClamFlowSuppliers, fetchClamFlowSupplier, fetchOnboardingStatus, fetchSupplierLots, fetchSupplierLotSummary, fetchClamFlowStaff, maskAadhaar } from '../lib/clamflow';
import { writeAuditLog } from '../lib/auditLog';

const TABS = [
  { key: 'companies', label: 'Companies', icon: '🏢' },
  { key: 'vendors', label: 'Vendors', icon: '📦' },
  { key: 'buyers', label: 'Buyers', icon: '🛒' },
  { key: 'products', label: 'Products', icon: '🏷️' },
  { key: 'delivery', label: 'Delivery Addresses', icon: '📍' },
  { key: 'tally', label: 'Tally Config', icon: '⚙️' },
  { key: 'clamflow', label: 'ClamFlow Suppliers', icon: '🦪', requiresClamFlow: true },
  { key: 'personnel', label: 'Personnel', icon: '👷', requiresClamFlow: true },
];

export default function MasterData() {
  const { activeCompany, isSuperAdmin, hasRole, canAccessClamFlow } = useAuth();
  const addToast = useToast();

  const [tab, setTab] = useState('companies');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Slide-over
  const [slideOpen, setSlideOpen] = useState(false);
  const [slideTitle, setSlideTitle] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Data
  const [companies, setCompanies] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [products, setProducts] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [tallyConf, setTallyConf] = useState(null);
  const [cfSuppliers, setCfSuppliers] = useState([]);
  const [cfStaff, setCfStaff] = useState([]);

  // ClamFlow supplier detail slide-over
  const [cfDetail, setCfDetail] = useState(null);
  const [cfOnboarding, setCfOnboarding] = useState(null);
  const [cfLots, setCfLots] = useState([]);
  const [cfSummary, setCfSummary] = useState(null);

  const canEdit = hasRole(['super_admin', 'admin', 'operations']);
  const canEditCompany = isSuperAdmin;
  const canEditTally = hasRole(['super_admin', 'admin', 'accounts']);

  const visibleTabs = TABS.filter((t) => {
    if (t.requiresClamFlow && !canAccessClamFlow) return false;
    return true;
  });

  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  // ── Load data per tab ──
  const loadTab = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      switch (tab) {
        case 'companies': setCompanies(await fetchCompanies()); break;
        case 'vendors': setVendors(await fetchVendors(activeCompany.id, { search, activeOnly: !showInactive })); break;
        case 'buyers': setBuyers(await fetchBuyers(activeCompany.id, { search, activeOnly: !showInactive })); break;
        case 'products': setProducts(await fetchProducts(activeCompany.id, { search, activeOnly: !showInactive })); break;
        case 'delivery': setAddresses(await fetchDeliveryAddresses(activeCompany.id)); break;
        case 'tally': setTallyConf(await fetchTallyConfig(activeCompany.id)); break;
        case 'clamflow': setCfSuppliers(await fetchClamFlowSuppliers({ search }).catch(() => [])); break;
        case 'personnel': setCfStaff(await fetchClamFlowStaff({ search }).catch(() => [])); break;
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCompany, tab, search, showInactive, addToast]);

  useEffect(() => { loadTab(); }, [loadTab]);
  useEffect(() => { setSearch(''); setShowInactive(false); }, [tab]);

  // ── Open slide-over ──
  const openNew = (title, defaults = {}) => {
    setEditing(null);
    setForm({ company_id: activeCompany?.id, ...defaults });
    setSlideTitle(title);
    setSlideOpen(true);
  };

  const openEdit = (title, record) => {
    setEditing(record);
    setForm({ ...record });
    setSlideTitle(title);
    setSlideOpen(true);
  };

  const closeSlide = () => { setSlideOpen(false); setEditing(null); setForm({}); setCfDetail(null); };

  // ── ClamFlow supplier detail ──
  const openCfSupplier = async (supplier) => {
    setSlideTitle('ClamFlow Supplier');
    setCfDetail(supplier);
    setCfOnboarding(null);
    setCfLots([]);
    setCfSummary(null);
    setSlideOpen(true);
    try {
      const personId = supplier.person_records?.id;
      if (personId) {
        const [onb, lots, summary] = await Promise.all([
          fetchOnboardingStatus(personId).catch(() => null),
          fetchSupplierLots(supplier.id).catch(() => []),
          fetchSupplierLotSummary(supplier.id).catch(() => null),
        ]);
        setCfOnboarding(onb);
        setCfLots(lots);
        setCfSummary(summary);
      }
    } catch (_) { /* best effort */ }
  };

  // ── Generic save ──
  const handleSave = async (createFn, updateFn, tableName) => {
    setSaving(true);
    try {
      if (editing) {
        await updateFn(editing.id, form);
        writeAuditLog({ companyId: activeCompany?.id, action: 'update', tableName, recordId: editing.id });
        addToast('Updated successfully', 'success');
      } else {
        const created = await createFn(form);
        writeAuditLog({ companyId: activeCompany?.id, action: 'create', tableName, recordId: created.id });
        addToast('Created successfully', 'success');
      }
      closeSlide();
      loadTab();
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (toggleFn, id, newState, tableName) => {
    try {
      await toggleFn(id, newState);
      writeAuditLog({ companyId: activeCompany?.id, action: newState ? 'activate' : 'deactivate', tableName, recordId: id });
      addToast(newState ? 'Activated' : 'Deactivated', 'success');
      loadTab();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // ── Company save ──
  const saveCompany = async () => {
    setSaving(true);
    try {
      const { id, ...updates } = form;
      await updateCompany(id, updates);
      writeAuditLog({ companyId: id, action: 'update', tableName: 'companies', recordId: id });
      addToast('Company updated', 'success');
      closeSlide();
      loadTab();
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Tally config save ──
  const saveTallyConfig = async () => {
    setSaving(true);
    try {
      await upsertTallyConfig({ ...form, company_id: activeCompany?.id });
      writeAuditLog({ companyId: activeCompany?.id, action: 'upsert', tableName: 'tally_config' });
      addToast('Tally config saved', 'success');
      loadTab();
    } catch (err) {
      addToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Helper: search + inactive toggle bar ──
  const renderFilterBar = (placeholder, addLabel, onAdd) => (
    <div className="md-filter-bar">
      <input className="form-input md-filter-bar__search" placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} />
      <label className="md-filter-bar__toggle">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
      </label>
      {canEdit && onAdd && <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>{addLabel}</button>}
    </div>
  );

  // ── Render table helper ──
  const renderTable = (cols, rows, onRowClick) => (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead><tr>{cols.map((c) => <th key={c.key} className={c.className || ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="text-center text-muted" style={{ padding: '2rem' }}>No records found</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r.id || i} className="md-table__row" onClick={() => onRowClick?.(r)}>
              {cols.map((c) => <td key={c.key} className={c.className || ''}>{c.render ? c.render(r) : r[c.key] || '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Input helper ──
  const inp = (label, key, opts = {}) => (
    <div className={`form-group${opts.span2 ? ' form-group--span2' : ''}`}>
      <label className="form-label">{label}</label>
      {opts.textarea ? (
        <textarea className="form-input" value={form[key] || ''} onChange={(e) => setField(key, e.target.value)} rows={opts.rows || 3} placeholder={opts.placeholder} readOnly={opts.readOnly} />
      ) : opts.select ? (
        <select className="form-input" value={form[key] || ''} onChange={(e) => setField(key, e.target.value)}>
          {opts.options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
      ) : opts.toggle ? (
        <label className="md-toggle"><input type="checkbox" checked={!!form[key]} onChange={(e) => setField(key, e.target.checked)} /> {opts.toggleLabel || 'Active'}</label>
      ) : (
        <input className="form-input" type={opts.type || 'text'} value={form[key] ?? ''} onChange={(e) => setField(key, e.target.value)} placeholder={opts.placeholder} readOnly={opts.readOnly} />
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="md-page">
      {/* Left sidebar tabs */}
      <nav className="md-sidebar">
        <div className="md-sidebar__title">Master Data</div>
        {visibleTabs.map((t) => (
          <button key={t.key} type="button" className={`md-sidebar__item${tab === t.key ? ' md-sidebar__item--active' : ''}`} onClick={() => setTab(t.key)}>
            <span className="md-sidebar__icon">{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="md-content">
        {/* ═══ COMPANIES ═══ */}
        {tab === 'companies' && (
          <>
            <div className="md-content__header"><h2>Companies</h2></div>
            {loading ? <LoadingSpinner /> : renderTable(
              [
                { key: 'short_name', label: 'Code' },
                { key: 'name', label: 'Company Name' },
                { key: 'gstin', label: 'GSTIN' },
                { key: 'contact_name', label: 'Contact' },
                { key: 'contact_phone', label: 'Phone' },
              ],
              companies,
              canEditCompany ? (r) => openEdit('Edit Company', r) : undefined
            )}
          </>
        )}

        {/* ═══ VENDORS ═══ */}
        {tab === 'vendors' && (
          <>
            <div className="md-content__header"><h2>Vendors</h2><p className="text-muted">{activeCompany?.short_name}</p></div>
            {renderFilterBar('Search vendors…', '+ Add Vendor', () => openNew('New Vendor', { is_active: true }))}
            {loading ? <LoadingSpinner /> : renderTable(
              [
                { key: 'name', label: 'Vendor Name' },
                { key: 'contact_person', label: 'Contact' },
                { key: 'phone', label: 'Phone' },
                { key: 'city', label: 'City' },
                { key: 'gstin', label: 'GSTIN' },
                { key: 'is_active', label: 'Status', render: (r) => <span className={`badge badge--${r.is_active ? 'success' : 'muted'}`}>{r.is_active ? 'Active' : 'Inactive'}</span> },
              ],
              vendors,
              canEdit ? (r) => openEdit('Edit Vendor', r) : undefined
            )}
          </>
        )}

        {/* ═══ BUYERS ═══ */}
        {tab === 'buyers' && (
          <>
            <div className="md-content__header"><h2>Buyers</h2><p className="text-muted">{activeCompany?.short_name}</p></div>
            {renderFilterBar('Search buyers…', '+ Add Buyer', () => openNew('New Buyer', { is_active: true }))}
            {loading ? <LoadingSpinner /> : renderTable(
              [
                { key: 'name', label: 'Buyer Name' },
                { key: 'contact_person', label: 'Contact' },
                { key: 'phone', label: 'Phone' },
                { key: 'city', label: 'City' },
                { key: 'country', label: 'Country' },
                { key: 'is_active', label: 'Status', render: (r) => <span className={`badge badge--${r.is_active ? 'success' : 'muted'}`}>{r.is_active ? 'Active' : 'Inactive'}</span> },
              ],
              buyers,
              canEdit ? (r) => openEdit('Edit Buyer', r) : undefined
            )}
          </>
        )}

        {/* ═══ PRODUCTS ═══ */}
        {tab === 'products' && (
          <>
            <div className="md-content__header"><h2>Products</h2><p className="text-muted">{activeCompany?.short_name}</p></div>
            {renderFilterBar('Search products…', '+ Add Product', () => openNew('New Product', { is_active: true, unit: 'MT' }))}
            {loading ? <LoadingSpinner /> : renderTable(
              [
                { key: 'name', label: 'Product Name' },
                { key: 'hsn_code', label: 'HSN Code' },
                { key: 'unit', label: 'Unit' },
                { key: 'default_price', label: 'Default Price', className: 'text-right mono', render: (r) => r.default_price ? parseFloat(r.default_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—' },
                { key: 'is_active', label: 'Status', render: (r) => <span className={`badge badge--${r.is_active ? 'success' : 'muted'}`}>{r.is_active ? 'Active' : 'Inactive'}</span> },
              ],
              products,
              canEdit ? (r) => openEdit('Edit Product', r) : undefined
            )}
          </>
        )}

        {/* ═══ DELIVERY ADDRESSES ═══ */}
        {tab === 'delivery' && (
          <>
            <div className="md-content__header"><h2>Delivery Addresses</h2><p className="text-muted">{activeCompany?.short_name}</p></div>
            <div className="md-filter-bar">
              {canEdit && <button type="button" className="btn btn-primary btn-sm" onClick={() => openNew('New Delivery Address', { is_active: true })}>+ Add Address</button>}
            </div>
            {loading ? <LoadingSpinner /> : renderTable(
              [
                { key: 'label', label: 'Label' },
                { key: 'address_line1', label: 'Address' },
                { key: 'city', label: 'City' },
                { key: 'state', label: 'State' },
                { key: 'country', label: 'Country' },
                { key: 'is_active', label: 'Status', render: (r) => <span className={`badge badge--${r.is_active ? 'success' : 'muted'}`}>{r.is_active ? 'Active' : 'Inactive'}</span> },
              ],
              addresses,
              canEdit ? (r) => openEdit('Edit Address', r) : undefined
            )}
          </>
        )}

        {/* ═══ TALLY CONFIG ═══ */}
        {tab === 'tally' && (
          <>
            <div className="md-content__header"><h2>Tally Configuration</h2><p className="text-muted">{activeCompany?.short_name}</p></div>
            {loading ? <LoadingSpinner /> : (
              <div className="card">
                <div className="po-form__grid">
                  <div className="form-group form-group--span2">
                    <label className="form-label">Tally Company Name *</label>
                    <input className="form-input" placeholder="Exact company name as in Tally Prime" value={tallyConf?.tally_company_name || ''} onChange={(e) => setTallyConf((p) => ({ ...p, tally_company_name: e.target.value }))} readOnly={!canEditTally} />
                    <span className="form-hint">Used in XML header — SVCURRENTCOMPANY field</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cash Ledger</label>
                    <input className="form-input" placeholder="Cash" value={tallyConf?.cash_ledger || ''} onChange={(e) => setTallyConf((p) => ({ ...p, cash_ledger: e.target.value }))} readOnly={!canEditTally} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Bank Ledger</label>
                    <input className="form-input" placeholder="Bank Account" value={tallyConf?.bank_ledger || ''} onChange={(e) => setTallyConf((p) => ({ ...p, bank_ledger: e.target.value }))} readOnly={!canEditTally} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">UPI Ledger</label>
                    <input className="form-input" placeholder="UPI" value={tallyConf?.upi_ledger || ''} onChange={(e) => setTallyConf((p) => ({ ...p, upi_ledger: e.target.value }))} readOnly={!canEditTally} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tally Server URL</label>
                    <input className="form-input" placeholder="http://localhost:9000" value={tallyConf?.tally_server_url || ''} onChange={(e) => setTallyConf((p) => ({ ...p, tally_server_url: e.target.value }))} readOnly={!canEditTally} />
                    <span className="form-hint">For direct push (Step 22)</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Active</label>
                    <label className="md-toggle">
                      <input type="checkbox" checked={!!tallyConf?.is_active} onChange={(e) => setTallyConf((p) => ({ ...p, is_active: e.target.checked }))} disabled={!canEditTally} /> Enabled
                    </label>
                  </div>
                </div>
                {canEditTally && (
                  <div style={{ marginTop: '1rem' }}>
                    <button type="button" className="btn btn-primary" disabled={saving} onClick={saveTallyConfig}>{saving ? 'Saving…' : 'Save Tally Config'}</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ CLAMFLOW SUPPLIERS ═══ */}
        {tab === 'clamflow' && (
          <>
            <div className="md-content__header"><h2>ClamFlow Suppliers</h2><p className="text-muted">RHHF — Panavally Processing Plant (read-only)</p></div>
            <div className="md-filter-bar">
              <input className="form-input md-filter-bar__search" placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {loading ? <LoadingSpinner /> : renderTable(
              [
                { key: 'name', label: 'Supplier Name', render: (r) => r.person_records?.full_name || '—' },
                { key: 'mobile', label: 'Mobile', render: (r) => r.person_records?.mobile || '—' },
                { key: 'aadhar', label: 'Aadhaar', render: (r) => r.person_records?.aadhar_number ? maskAadhaar(r.person_records.aadhar_number) : '—' },
                { key: 'is_active', label: 'Status', render: (r) => <span className={`badge badge--${r.is_active ? 'success' : 'muted'}`}>{r.is_active ? 'Active' : 'Inactive'}</span> },
              ],
              cfSuppliers,
              (r) => openCfSupplier(r)
            )}
          </>
        )}

        {/* ═══ PERSONNEL ═══ */}
        {tab === 'personnel' && (
          <>
            <div className="md-content__header"><h2>Personnel</h2><p className="text-muted">RHHF — Panavally Processing Plant (read-only)</p></div>
            <div className="md-filter-bar">
              <input className="form-input md-filter-bar__search" placeholder="Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {loading ? <LoadingSpinner /> : renderTable(
              [
                { key: 'full_name', label: 'Name' },
                { key: 'mobile', label: 'Mobile' },
                { key: 'aadhar', label: 'Aadhaar', render: (r) => r.aadhar_number ? maskAadhaar(r.aadhar_number) : '—' },
                { key: 'person_type', label: 'Type' },
                { key: 'is_active', label: 'Status', render: (r) => <span className={`badge badge--${r.is_active !== false ? 'success' : 'muted'}`}>{r.is_active !== false ? 'Active' : 'Inactive'}</span> },
              ],
              cfStaff
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          SLIDE-OVER FORMS
          ══════════════════════════════════════════════════════ */}
      <SlideOver open={slideOpen} onClose={closeSlide} title={slideTitle}>

        {/* ─── Company form ─── */}
        {slideOpen && tab === 'companies' && !cfDetail && (
          <div className="md-slide-form">
            <div className="po-form__grid">
              {inp('Company ID', 'id', { readOnly: true })}
              {inp('Company Name', 'name')}
              {inp('Short Name', 'short_name')}
              {inp('GSTIN', 'gstin')}
              {inp('Address', 'address', { span2: true, textarea: true })}
              {inp('Contact Name', 'contact_name')}
              {inp('Contact Phone', 'contact_phone')}
            </div>
            {canEditCompany && (
              <div className="md-slide-form__actions">
                <button type="button" className="btn btn-primary" disabled={saving} onClick={saveCompany}>{saving ? 'Saving…' : 'Save'}</button>
                <button type="button" className="btn" onClick={closeSlide}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {/* ─── Vendor form ─── */}
        {slideOpen && tab === 'vendors' && (
          <div className="md-slide-form">
            <div className="po-form__grid">
              {inp('Vendor Name *', 'name')}
              {inp('Contact Person', 'contact_person')}
              {inp('Phone', 'phone')}
              {inp('Email', 'email', { type: 'email' })}
              {inp('Address Line 1', 'address_line1', { span2: true })}
              {inp('Address Line 2', 'address_line2', { span2: true })}
              {inp('City', 'city')}
              {inp('State', 'state')}
              {inp('Postal Code', 'postal_code')}
              {inp('Country', 'country')}
              {inp('GSTIN / Tax ID', 'gstin')}
              {inp('Active', 'is_active', { toggle: true })}
            </div>
            <div className="md-slide-form__actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => handleSave(createVendor, updateVendor, 'vendors')}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
              <button type="button" className="btn" onClick={closeSlide}>Cancel</button>
              {editing && (
                <button type="button" className={`btn btn-sm ${editing.is_active ? 'btn-danger-outline' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => { handleToggle(toggleVendorActive, editing.id, !editing.is_active, 'vendors'); closeSlide(); }}>
                  {editing.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── Buyer form ─── */}
        {slideOpen && tab === 'buyers' && (
          <div className="md-slide-form">
            <div className="po-form__grid">
              {inp('Buyer Name *', 'name')}
              {inp('Contact Person', 'contact_person')}
              {inp('Phone', 'phone')}
              {inp('Email', 'email', { type: 'email' })}
              {inp('Address Line 1', 'address_line1', { span2: true })}
              {inp('Address Line 2', 'address_line2', { span2: true })}
              {inp('City', 'city')}
              {inp('State', 'state')}
              {inp('Postal Code', 'postal_code')}
              {inp('Country', 'country')}
              {inp('GSTIN / Tax ID', 'gstin')}
              {inp('Active', 'is_active', { toggle: true })}
            </div>
            <div className="md-slide-form__actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => handleSave(createBuyer, updateBuyer, 'buyers')}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
              <button type="button" className="btn" onClick={closeSlide}>Cancel</button>
              {editing && (
                <button type="button" className={`btn btn-sm ${editing.is_active ? 'btn-danger-outline' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => { handleToggle(toggleBuyerActive, editing.id, !editing.is_active, 'buyers'); closeSlide(); }}>
                  {editing.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── Product form ─── */}
        {slideOpen && tab === 'products' && (
          <div className="md-slide-form">
            <div className="po-form__grid">
              {inp('Product Name *', 'name', { span2: true })}
              {inp('Description', 'description', { span2: true, textarea: true })}
              {inp('HSN Code', 'hsn_code', { placeholder: '030739' })}
              {inp('Unit', 'unit', { placeholder: 'MT' })}
              {inp('Default Price', 'default_price', { type: 'number' })}
              {inp('Active', 'is_active', { toggle: true })}
            </div>
            <div className="md-slide-form__actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => handleSave(createProduct, updateProduct, 'products')}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
              <button type="button" className="btn" onClick={closeSlide}>Cancel</button>
              {editing && (
                <button type="button" className={`btn btn-sm ${editing.is_active ? 'btn-danger-outline' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => { handleToggle(toggleProductActive, editing.id, !editing.is_active, 'products'); closeSlide(); }}>
                  {editing.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── Delivery Address form ─── */}
        {slideOpen && tab === 'delivery' && (
          <div className="md-slide-form">
            <div className="po-form__grid">
              {inp('Label *', 'label', { placeholder: 'e.g. Head Office, Warehouse #2', span2: true })}
              {inp('Address Line 1', 'address_line1', { span2: true })}
              {inp('Address Line 2', 'address_line2', { span2: true })}
              {inp('City', 'city')}
              {inp('State', 'state')}
              {inp('Postal Code', 'postal_code')}
              {inp('Country', 'country')}
              {inp('Active', 'is_active', { toggle: true })}
            </div>
            <div className="md-slide-form__actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => handleSave(createDeliveryAddress, updateDeliveryAddress, 'delivery_addresses')}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</button>
              <button type="button" className="btn" onClick={closeSlide}>Cancel</button>
              {editing && (
                <button type="button" className={`btn btn-sm ${editing.is_active ? 'btn-danger-outline' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => { handleToggle(toggleDeliveryAddressActive, editing.id, !editing.is_active, 'delivery_addresses'); closeSlide(); }}>
                  {editing.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── ClamFlow Supplier detail (read-only) ─── */}
        {slideOpen && cfDetail && (
          <div className="md-slide-form">
            <div className="md-cf-detail">
              <div className="md-cf-detail__section">
                <h3>Supplier Info</h3>
                <div className="md-cf-detail__grid">
                  <div><span className="text-muted">Name</span><div>{cfDetail.person_records?.full_name || '—'}</div></div>
                  <div><span className="text-muted">Mobile</span><div>{cfDetail.person_records?.mobile || '—'}</div></div>
                  <div><span className="text-muted">Aadhaar</span><div>{cfDetail.person_records?.aadhar_number ? maskAadhaar(cfDetail.person_records.aadhar_number) : '—'}</div></div>
                  <div><span className="text-muted">Status</span><div><span className={`badge badge--${cfDetail.is_active ? 'success' : 'muted'}`}>{cfDetail.is_active ? 'Active' : 'Inactive'}</span></div></div>
                </div>
              </div>

              {cfOnboarding && (
                <div className="md-cf-detail__section">
                  <h3>Onboarding Status</h3>
                  <div className="md-cf-detail__grid">
                    <div><span className="text-muted">Status</span><div>{cfOnboarding.status || '—'}</div></div>
                    <div><span className="text-muted">Created</span><div>{cfOnboarding.created_at ? new Date(cfOnboarding.created_at).toLocaleDateString() : '—'}</div></div>
                  </div>
                </div>
              )}

              {cfSummary && (
                <div className="md-cf-detail__section">
                  <h3>Supply Summary</h3>
                  <div className="md-cf-detail__grid">
                    <div><span className="text-muted">Total Lots</span><div><strong>{cfSummary.totalLots}</strong></div></div>
                    <div><span className="text-muted">Total Weight</span><div><strong>{cfSummary.totalKg?.toLocaleString()} kg</strong></div></div>
                  </div>
                </div>
              )}

              {cfLots.length > 0 && (
                <div className="md-cf-detail__section">
                  <h3>Delivery History (last 10)</h3>
                  <table className="md-table" style={{ fontSize: '0.75rem' }}>
                    <thead><tr><th>Date</th><th className="text-right">Weight (kg)</th><th>Status</th></tr></thead>
                    <tbody>
                      {cfLots.map((lot) => (
                        <tr key={lot.id}>
                          <td>{lot.arrival_date ? new Date(lot.arrival_date).toLocaleDateString() : '—'}</td>
                          <td className="text-right mono">{parseFloat(lot.weight_kg || 0).toLocaleString()}</td>
                          <td>{lot.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
