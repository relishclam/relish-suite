import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchPurchaseOrders } from '../lib/purchaseOrders';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useToast } from '../components/common/Toast';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_COLORS = {
  draft: 'badge--muted',
  pending_approval: 'badge--warning',
  approved: 'badge--success',
  rejected: 'badge--error',
};

const STATUS_LABELS = {
  draft: 'Draft',
  pending_approval: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const PAGE_SIZE = 20;

const fmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function PurchaseOrders() {
  const { activeCompany, hasRole } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();

  const [orders, setOrders] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const canEdit = hasRole(['super_admin', 'admin', 'operations']);

  const loadOrders = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const { data, count: total } = await fetchPurchaseOrders(activeCompany.id, {
        status: statusFilter || undefined,
        search,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setOrders(data || []);
      setCount(total || 0);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCompany, statusFilter, search, page, addToast]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, activeCompany]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="po-page">
      <div className="po-page__header">
        <div>
          <h1 className="po-page__title">Purchase Orders</h1>
          <p className="po-page__subtitle">
            {activeCompany?.short_name} — {count} order{count !== 1 ? 's' : ''}
          </p>
        </div>
        {canEdit && (
          <Link to="/purchase-orders/new" className="btn btn-primary">
            + New PO
          </Link>
        )}
      </div>

      <div className="po-page__filters">
        <input
          type="text"
          className="form-input po-page__search"
          placeholder="Search by PO number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-input po-page__status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : orders.length === 0 ? (
        <div className="po-page__empty card">
          <p>No purchase orders found.</p>
          {canEdit && (
            <Link
              to="/purchase-orders/new"
              className="btn btn-primary"
              style={{ marginTop: '0.75rem' }}
            >
              Create your first PO
            </Link>
          )}
        </div>
      ) : (
        <div className="po-table-wrap">
          <table className="po-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th>Currency</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr
                  key={po.id}
                  className="po-table__row"
                  onClick={() => navigate(`/purchase-orders/${po.id}`)}
                >
                  <td className="po-table__number">{po.po_number}</td>
                  <td>{po.po_date || '—'}</td>
                  <td>{po.vendors?.name || '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[po.status] || ''}`}>
                      {STATUS_LABELS[po.status] || po.status}
                    </span>
                  </td>
                  <td className="text-right mono">{fmt(po.total)}</td>
                  <td>{po.currency || 'INR'}</td>
                  <td>
                    {canEdit && (
                      <Link
                        to={`/purchase-orders/${po.id}`}
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
