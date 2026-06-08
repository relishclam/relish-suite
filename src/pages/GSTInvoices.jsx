import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import { fetchGSTInvoices } from '../lib/gstInvoices';
import LoadingSpinner from '../components/common/LoadingSpinner';

const STATUS_BADGE = {
  draft:    'badge--muted',
  final:    'badge--success',
  cancelled:'badge--error',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmt = (v) => (parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GSTInvoices() {
  const navigate = useNavigate();
  const { activeCompany, permissions } = useAuth();
  const addToast = useToast();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const { data } = await fetchGSTInvoices(activeCompany.id);
      setInvoices(data || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCompany, addToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (inv.invoice_number || '').toLowerCase().includes(q) ||
           (inv.bill_to_company || '').toLowerCase().includes(q);
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">GST Invoices — Lease Rental</h1>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>HSN/SAC 997212 · Factory lease rentals · {activeCompany?.short_name}</p>
        </div>
        {permissions.canCreateInvoice && (
          <button type="button" className="btn btn-primary" onClick={() => navigate('/gst-invoices/new')}>
            + New GST Invoice
          </button>
        )}
      </div>

      <div className="md-filter-bar">
        <input className="form-input md-filter-bar__search" placeholder="Search by invoice number or lessee…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Date</th>
                <th>Billed To</th>
                <th>GSTIN</th>
                <th className="text-right">Taxable (₹)</th>
                <th className="text-right">Tax (₹)</th>
                <th className="text-right">Total (₹)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted" style={{ padding: '2rem' }}>No GST invoices yet</td></tr>
              ) : filtered.map((inv) => (
                <tr key={inv.id} className="md-table__row" onClick={() => navigate(`/gst-invoices/${inv.id}/edit`)}>
                  <td className="mono">{inv.invoice_number || '—'}</td>
                  <td>{fmtDate(inv.invoice_date)}</td>
                  <td>{inv.bill_to_company || inv.lessee_name || '—'}</td>
                  <td className="mono" style={{ fontSize: '0.8rem' }}>{inv.bill_to_gstin || inv.lessee_gstin || '—'}</td>
                  <td className="text-right mono">₹{fmt(inv.subtotal)}</td>
                  <td className="text-right mono">₹{fmt(inv.tax_amount)}</td>
                  <td className="text-right mono">₹{fmt(inv.total)}</td>
                  <td><span className={`badge ${STATUS_BADGE[inv.status] || 'badge--muted'}`}>{inv.status || 'draft'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
