import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import SlideOver from '../components/common/SlideOver';
import {
  fetchShellStock,
  createShellEntry,
  updateShellEntry,
  deleteShellEntry,
  directionFor,
} from '../lib/shellStock';

// ── Constants ──────────────────────────────────────────────────────
const ENTRY_TYPES = [
  { value: 'receipt',     label: 'Receipt',     direction: 'in',  color: 'badge--success' },
  { value: 'consumption', label: 'Consumption', direction: 'out', color: 'badge--muted'   },
  { value: 'sale',        label: 'Sale',        direction: 'out', color: 'badge--info'    },
  { value: 'adjustment',  label: 'Adjustment',  direction: null,  color: 'badge--warning' },
];

const TYPE_META = Object.fromEntries(ENTRY_TYPES.map((t) => [t.value, t]));

const today = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtQty = (v) => {
  const n = parseFloat(v) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const EMPTY_FORM = {
  entry_date:  today(),
  entry_type:  'receipt',
  direction:   'in',
  quantity_kg: '',
  ref_batch:   '',
  ref_invoice: '',
  remarks:     '',
};

// ── KPI Card ──────────────────────────────────────────────────────
function KpiCard({ label, value, unit = 'Kg', accent }) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${accent}` }}>
      <p className="kpi-card__label">{label}</p>
      <p className="kpi-card__value">{fmtQty(value)}</p>
      <p className="kpi-card__unit">{unit}</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function CalciWorks() {
  const { activeCompany, permissions, user } = useAuth();
  const addToast = useToast();

  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Slide-over
  const [slideOpen, setSlideOpen] = useState(false);
  const [editing, setEditing]     = useState(null);   // null = new entry
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const canEdit = permissions.canManageMasterData || permissions.canCreateInvoice;

  // ── Load ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const { data } = await fetchShellStock(activeCompany.id);
      setEntries(data || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCompany, addToast]);

  useEffect(() => { load(); }, [load]);

  // ── KPIs ────────────────────────────────────────────────────────
  const totalIn  = entries.filter((e) => e.direction === 'in').reduce((s, e) => s + parseFloat(e.quantity_kg || 0), 0);
  const totalOut = entries.filter((e) => e.direction === 'out').reduce((s, e) => s + parseFloat(e.quantity_kg || 0), 0);
  const balance  = totalIn - totalOut;

  // ── Filter ──────────────────────────────────────────────────────
  const filtered = entries.filter((e) => {
    if (typeFilter !== 'all' && e.entry_type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.ref_batch   || '').toLowerCase().includes(q) ||
      (e.ref_invoice || '').toLowerCase().includes(q) ||
      (e.remarks     || '').toLowerCase().includes(q)
    );
  });

  // ── Slide-over helpers ──────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSlideOpen(true);
  };

  const openEdit = (entry) => {
    if (!canEdit) return;
    setEditing(entry);
    setForm({
      entry_date:  entry.entry_date?.slice(0, 10) || today(),
      entry_type:  entry.entry_type,
      direction:   entry.direction,
      quantity_kg: entry.quantity_kg?.toString() || '',
      ref_batch:   entry.ref_batch   || '',
      ref_invoice: entry.ref_invoice || '',
      remarks:     entry.remarks     || '',
    });
    setSlideOpen(true);
  };

  const handleTypeChange = (type) => {
    const dir = directionFor(type, form.direction);
    setForm((f) => ({ ...f, entry_type: type, direction: dir }));
  };

  const handleSave = async () => {
    if (!form.quantity_kg || parseFloat(form.quantity_kg) <= 0) {
      addToast('Quantity must be greater than zero', 'error');
      return;
    }
    if (!form.entry_date) {
      addToast('Entry date is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id:  activeCompany.id,
        entry_date:  form.entry_date,
        entry_type:  form.entry_type,
        direction:   directionFor(form.entry_type, form.direction),
        quantity_kg: parseFloat(form.quantity_kg),
        ref_batch:   form.ref_batch   || null,
        ref_invoice: form.ref_invoice || null,
        remarks:     form.remarks     || null,
        created_by:  user?.id,
      };
      if (editing) {
        await updateShellEntry(editing.id, payload);
        addToast('Entry updated', 'success');
      } else {
        await createShellEntry(payload);
        addToast('Entry saved', 'success');
      }
      setSlideOpen(false);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteShellEntry(id);
      setConfirmDelete(null);
      setSlideOpen(false);
      addToast('Entry deleted', 'success');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🐚 CalciWorks</h1>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Shell Stock Ledger · RHHF Division · {activeCompany?.short_name}
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + New Entry
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="kpi-row">
        <KpiCard label="Total Received"   value={totalIn}   accent="var(--success)" />
        <KpiCard label="Total Out"        value={totalOut}  accent="var(--error)"   />
        <KpiCard label="Current Balance"  value={balance}   accent={balance < 0 ? 'var(--error)' : 'var(--accent)'} />
        <KpiCard label="Transactions"     value={entries.length} unit="entries" accent="var(--text-muted)" />
      </div>

      {/* Filter bar */}
      <div className="md-filter-bar">
        <input
          className="form-input md-filter-bar__search"
          placeholder="Search batch ref, invoice, remarks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '140px' }}
        >
          <option value="all">All Types</option>
          {ENTRY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Ledger table */}
      {loading ? <LoadingSpinner /> : (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Direction</th>
                <th className="text-right">Qty (Kg)</th>
                <th>Batch Ref</th>
                <th>Invoice Ref</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted" style={{ padding: '2rem' }}>
                    No entries yet. Click "+ New Entry" to add your first shell stock record.
                  </td>
                </tr>
              ) : filtered.map((e) => (
                <tr
                  key={e.id}
                  className="md-table__row"
                  onClick={() => openEdit(e)}
                  style={{ cursor: canEdit ? 'pointer' : 'default' }}
                >
                  <td>{fmtDate(e.entry_date)}</td>
                  <td>
                    <span className={`badge ${TYPE_META[e.entry_type]?.color || 'badge--muted'}`}>
                      {TYPE_META[e.entry_type]?.label || e.entry_type}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${e.direction === 'in' ? 'badge--success' : 'badge--error'}`}>
                      {e.direction === 'in' ? '▲ In' : '▼ Out'}
                    </span>
                  </td>
                  <td className="text-right mono">{fmtQty(e.quantity_kg)}</td>
                  <td className="mono" style={{ fontSize: '0.82rem' }}>{e.ref_batch   || '—'}</td>
                  <td className="mono" style={{ fontSize: '0.82rem' }}>{e.ref_invoice || '—'}</td>
                  <td className="text-muted" style={{ fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.remarks || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Running total footer */}
      {!loading && entries.length > 0 && (
        <div style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {filtered.length} of {entries.length} entries shown
        </div>
      )}

      {/* ── SlideOver: Add / Edit entry ── */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editing ? 'Edit Stock Entry' : 'New Stock Entry'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Entry Date */}
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input
              type="date"
              className="form-input"
              value={form.entry_date}
              onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
            />
          </div>

          {/* Entry Type */}
          <div className="form-group">
            <label className="form-label">Entry Type *</label>
            <select
              className="form-input"
              value={form.entry_type}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              {ENTRY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="form-hint">
              {form.entry_type === 'receipt'     && 'Shells received from clam processing batch (stock in)'}
              {form.entry_type === 'consumption' && 'Shells consumed internally for processing (stock out)'}
              {form.entry_type === 'sale'        && 'Shells sold to external buyer (stock out)'}
              {form.entry_type === 'adjustment'  && 'Manual stock correction — specify direction below'}
            </p>
          </div>

          {/* Direction — only shown for adjustment */}
          {form.entry_type === 'adjustment' && (
            <div className="form-group">
              <label className="form-label">Direction *</label>
              <select
                className="form-input"
                value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
              >
                <option value="in">In (increase stock)</option>
                <option value="out">Out (decrease stock)</option>
              </select>
            </div>
          )}

          {/* Quantity */}
          <div className="form-group">
            <label className="form-label">Quantity (Kg) *</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              className="form-input"
              placeholder="0.000"
              value={form.quantity_kg}
              onChange={(e) => setForm((f) => ({ ...f, quantity_kg: e.target.value }))}
            />
          </div>

          {/* Batch Ref — shown for receipt */}
          {form.entry_type === 'receipt' && (
            <div className="form-group">
              <label className="form-label">Batch / Lot Ref</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. CF-LOT-2026-001"
                value={form.ref_batch}
                onChange={(e) => setForm((f) => ({ ...f, ref_batch: e.target.value }))}
              />
              <p className="form-hint">ClamFlow lot or batch reference number</p>
            </div>
          )}

          {/* Invoice Ref — shown for sale */}
          {form.entry_type === 'sale' && (
            <div className="form-group">
              <label className="form-label">Sale Invoice No.</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. RHHF/GSTI/2026/0001"
                value={form.ref_invoice}
                onChange={(e) => setForm((f) => ({ ...f, ref_invoice: e.target.value }))}
              />
              <p className="form-hint">CalciWorks sales invoice number</p>
            </div>
          )}

          {/* Remarks */}
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Optional notes…"
              value={form.remarks}
              onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
            {editing && canEdit && (
              <>
                {confirmDelete === editing.id ? (
                  <>
                    <span style={{ fontSize: '0.85rem', color: 'var(--error)', alignSelf: 'center' }}>Confirm delete?</span>
                    <button type="button" className="btn btn-danger" onClick={() => handleDelete(editing.id)}>Yes, delete</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-ghost" style={{ color: 'var(--error)', marginRight: 'auto' }}
                    onClick={() => setConfirmDelete(editing.id)}>
                    Delete
                  </button>
                )}
              </>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setSlideOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Save Entry'}
            </button>
          </div>

        </div>
      </SlideOver>
    </div>
  );
}
