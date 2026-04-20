import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchInvoices } from '../lib/invoices';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useToast } from '../components/common/Toast';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'proforma', label: 'Proforma' },
  { value: 'commercial', label: 'Commercial' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS = {
  draft: 'badge--muted',
  sent: 'badge--warning',
  paid: 'badge--success',
  cancelled: 'badge--error',
};

const TYPE_COLORS = {
  proforma: 'badge--info',
  commercial: 'badge--teal',
};

const PAGE_SIZE = 20;

const fmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function Invoices() {
  const { activeCompany, hasRole } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();

  const [invoices, setInvoices] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const canEdit = hasRole(['super_admin', 'admin', 'operations']);

  const loadInvoices = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const { data, count: total } = await fetchInvoices(activeCompany.id, {
        status: statusFilter || undefined,
        invoiceType: typeFilter || undefined,
        search,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setInvoices(data || []);
      setCount(total || 0);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCompany, statusFilter, typeFilter, search, page, addToast]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, typeFilter, activeCompany]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="po-page">
      <div className="po-page__header">
        <div>
          <h1 className="po-page__title">Invoices</h1>
          <p className="po-page__subtitle">
            {activeCompany?.short_name} — {count} invoice{count !== 1 ? 's' : ''}
          </p>
        </div>
        {canEdit && (
          <Link to="/invoices/new" className="btn btn-primary">
            + New Invoice
          </Link>
        )}
      </div>

      <div className="po-page__filters">
        <input
          type="text"
          className="form-input po-page__search"
          placeholder="Search by invoice number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-input"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ minWidth: 140 }}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="form-input po-page__status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : invoices.length === 0 ? (
        <div className="po-page__empty card">
          <p>No invoices found.</p>
          {canEdit && (
            <Link to="/invoices/new" className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
              Create your first invoice
            </Link>
          )}
        </div>
      ) : (
        <div className="po-table-wrap">
          <table className="po-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Date</th>
                <th>Buyer</th>
                <th>Type</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th>Currency</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="po-table__row"
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                >
                  <td className="po-table__number">{inv.invoice_number}</td>
                  <td>{inv.invoice_date || '—'}</td>
                  <td>{inv.buyers?.name || '—'}</td>
                  <td>
                    <span className={`badge ${TYPE_COLORS[inv.invoice_type] || 'badge--muted'}`}>
                      {inv.invoice_type === 'commercial' ? 'Commercial' : 'Proforma'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[inv.status] || ''}`}>
                      {inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : '—'}
                    </span>
                  </td>
                  <td className="text-right mono">{fmt(inv.total)}</td>
                  <td>{inv.currency || 'USD'}</td>
                  <td>
                    {canEdit && (
                      <Link
                        to={`/invoices/${inv.id}`}
                        className="btn btn-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Edit
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="po-page__pagination">
          <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ← Prev
          </button>
          <span className="po-page__page-info">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
