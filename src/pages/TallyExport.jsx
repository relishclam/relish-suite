import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/common/Toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  fetchApprovedVouchers,
  fetchExportedVoucherIds,
  fetchTallyExports,
  createBatchExport,
  updateTallyExport,
} from '../lib/tallyExports';
import { fetchTallyConfig } from '../lib/tallyConfig';
import { generateTallyXml, downloadXmlFile } from '../lib/tallyXml';
import { writeAuditLog } from '../lib/auditLog';

const MODE_LABELS = { Cash: 'Cash', UPI: 'UPI', 'Account Transfer': 'Bank Transfer' };

const fmt = (v) =>
  (parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function TallyExport() {
  const { activeCompany, user } = useAuth();
  const addToast = useToast();

  const [tab, setTab] = useState('export'); // 'export' | 'history'
  const [loading, setLoading] = useState(true);

  // Export tab state
  const [vouchers, setVouchers] = useState([]);
  const [exportedMap, setExportedMap] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [tallyConfig, setTallyConfig] = useState(null);
  const [modeFilter, setModeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pushing, setPushing] = useState(false);

  // History tab state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState(null);

  // Load vouchers + exported map + tally config
  const loadExportTab = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const [voucherData, expMap, config] = await Promise.all([
        fetchApprovedVouchers(activeCompany.id, {
          from: dateFrom || undefined,
          to: dateTo || undefined,
        }),
        fetchExportedVoucherIds(activeCompany.id),
        fetchTallyConfig(activeCompany.id),
      ]);
      setVouchers(voucherData);
      setExportedMap(expMap);
      setTallyConfig(config);
      setSelected(new Set());
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCompany, dateFrom, dateTo, addToast]);

  const loadHistory = useCallback(async () => {
    if (!activeCompany) return;
    setHistoryLoading(true);
    try {
      const { data } = await fetchTallyExports(activeCompany.id, { limit: 200 });
      setHistory(data || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [activeCompany, addToast]);

  useEffect(() => {
    if (tab === 'export') loadExportTab();
    else loadHistory();
  }, [tab, loadExportTab, loadHistory]);

  // Derived: unexported vouchers
  const unexported = useMemo(
    () => vouchers.filter((v) => !exportedMap[v.id]),
    [vouchers, exportedMap]
  );

  const filtered = useMemo(() => {
    let list = vouchers;
    if (modeFilter) list = list.filter((v) => v.payment_mode === modeFilter);
    return list;
  }, [vouchers, modeFilter]);

  // Select helpers
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllUnexported = () => {
    const ids = filtered.filter((v) => !exportedMap[v.id]).map((v) => v.id);
    setSelected(new Set(ids));
  };

  const deselectAll = () => setSelected(new Set());

  // Export handler
  const handleExport = async () => {
    if (!tallyConfig) {
      addToast(`Tally configuration not set for ${activeCompany?.short_name}. Please configure Tally settings in Master Data → Tally Config before exporting.`, 'error');
      return;
    }
    if (selected.size === 0) {
      addToast('Select at least one voucher to export.', 'error');
      return;
    }

    setExporting(true);
    try {
      const toExport = vouchers.filter((v) => selected.has(v.id));
      const xmlString = generateTallyXml(toExport, tallyConfig);
      const batchId = crypto.randomUUID();

      // Save export records to Suite DB
      const records = toExport.map((v) => ({
        company_id: activeCompany.id,
        voucher_id: v.id,
        voucher_serial: v.serial_number,
        voucher_amount: parseFloat(v.amount) || 0,
        voucher_date: v.approved_at || v.completed_at,
        payee_name: v.payee_name,
        payment_mode: v.payment_mode,
        export_type: 'payment_voucher',
        xml_payload: xmlString,
        batch_id: batchId,
        export_status: 'exported',
        exported_by: user?.id || null,
      }));

      await createBatchExport(records);

      // Download XML file
      const filename = downloadXmlFile(xmlString, activeCompany.short_name || activeCompany.id);

      writeAuditLog({
        companyId: activeCompany.id,
        action: 'tally_export',
        tableName: 'tally_exports',
        recordId: batchId,
        details: { voucher_count: toExport.length, filename },
      });

      addToast(
        `${toExport.length} voucher${toExport.length !== 1 ? 's' : ''} exported. File downloaded: ${filename}. Import into Tally Prime: Gateway of Tally → Import Data → Vouchers`,
        'success'
      );

      // Refresh
      await loadExportTab();
    } catch (err) {
      addToast('Export failed: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // History: group by batch
  const batches = useMemo(() => {

  // ── Push to Tally handler ──
  const handlePush = async () => {
    if (!tallyConfig?.tally_server_url) {
      addToast('Tally server URL not configured. Set it in Master Data → Tally Config.', 'error');
      return;
    }
    if (selected.size === 0) {
      addToast('Select at least one voucher to push.', 'error');
      return;
    }

    setPushing(true);
    try {
      const toExport = vouchers.filter((v) => selected.has(v.id));
      const xmlString = generateTallyXml(toExport, tallyConfig);
      const batchId = crypto.randomUUID();

      // Save export records first
      const records = toExport.map((v) => ({
        company_id: activeCompany.id,
        voucher_id: v.id,
        voucher_serial: v.serial_number,
        voucher_amount: parseFloat(v.amount) || 0,
        voucher_date: v.approved_at || v.completed_at,
        payee_name: v.payee_name,
        payment_mode: v.payment_mode,
        export_type: 'payment_voucher',
        xml_payload: xmlString,
        batch_id: batchId,
        export_status: 'exported',
        exported_by: user?.id || null,
      }));

      const saved = await createBatchExport(records);

      // Push via serverless proxy
      const resp = await fetch('/api/tally-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: xmlString, tallyUrl: tallyConfig.tally_server_url }),
      });

      const result = await resp.json();

      if (resp.ok && result.success) {
        // Update export records with tally response
        for (const rec of saved) {
          await updateTallyExport(rec.id, {
            tally_response: result.body?.slice(0, 2000),
          }).catch(() => {});
        }

        writeAuditLog({
          companyId: activeCompany.id,
          action: 'tally_push',
          tableName: 'tally_exports',
          recordId: batchId,
          details: { voucher_count: toExport.length, status: result.status },
        });

        addToast(`${toExport.length} voucher${toExport.length !== 1 ? 's' : ''} pushed to Tally successfully.`, 'success');
      } else {
        // Mark as failed
        for (const rec of saved) {
          await updateTallyExport(rec.id, {
            export_status: 'failed',
            error_message: result.error || result.body?.slice(0, 500),
          }).catch(() => {});
        }

        addToast('Push failed: ' + (result.error || `Tally responded with ${result.status}`), 'error');
      }

      await loadExportTab();
    } catch (err) {
      addToast('Push failed: ' + err.message, 'error');
    } finally {
      setPushing(false);
    }
  };
    const map = {};
    history.forEach((r) => {
      const key = r.batch_id || r.id;
      if (!map[key]) {
        map[key] = {
          batch_id: r.batch_id,
          exported_at: r.exported_at,
          export_status: r.export_status,
          records: [],
          totalAmount: 0,
        };
      }
      map[key].records.push(r);
      map[key].totalAmount += parseFloat(r.voucher_amount) || 0;
    });
    return Object.values(map).sort((a, b) => new Date(b.exported_at) - new Date(a.exported_at));
  }, [history]);

  // Re-download from stored xml_payload
  const handleRedownload = (batch) => {
    const first = batch.records.find((r) => r.xml_payload);
    if (!first?.xml_payload) {
      addToast('XML payload not available for this batch.', 'error');
      return;
    }
    downloadXmlFile(first.xml_payload, activeCompany?.short_name || 'Export');
    addToast('File re-downloaded.', 'success');
  };

  const configMissing = tab === 'export' && !loading && !tallyConfig;

  return (
    <div className="tally-page">
      <div className="tally-page__header">
        <div>
          <h1 className="tally-page__title">Tally Export</h1>
          <p className="tally-page__subtitle">{activeCompany?.short_name} — Export approved vouchers to Tally Prime XML</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tally-tabs">
        <button type="button" className={`tally-tabs__btn${tab === 'export' ? ' tally-tabs__btn--active' : ''}`} onClick={() => setTab('export')}>Export Vouchers</button>
        <button type="button" className={`tally-tabs__btn${tab === 'history' ? ' tally-tabs__btn--active' : ''}`} onClick={() => setTab('history')}>Export History</button>
      </div>

      {/* ═══ EXPORT TAB ═══ */}
      {tab === 'export' && (
        <>
          {configMissing && (
            <div className="card tally-page__warning">
              <strong>Tally configuration not set for {activeCompany?.short_name}.</strong>
              <p>Please configure Tally settings in Master Data → Tally Config before exporting vouchers.</p>
            </div>
          )}

          {/* Filters */}
          <div className="tally-page__filters">
            <div className="form-group">
              <label className="form-label">From Date</label>
              <input type="date" className="form-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">To Date</label>
              <input type="date" className="form-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Mode</label>
              <select className="form-input" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
                <option value="">All Modes</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Account Transfer">Account Transfer</option>
              </select>
            </div>
            <div className="form-group tally-page__filter-actions">
              <button type="button" className="btn btn-sm" onClick={loadExportTab}>Refresh</button>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <div className="card tally-page__empty"><p>No approved vouchers found for the selected filters.</p></div>
          ) : (
            <>
              {/* Selection bar */}
              <div className="tally-page__selection-bar">
                <button type="button" className="btn btn-sm" onClick={selectAllUnexported}>
                  Select all un-exported ({unexported.filter((v) => !modeFilter || v.payment_mode === modeFilter).length})
                </button>
                {selected.size > 0 && (
                  <button type="button" className="btn btn-sm" onClick={deselectAll}>Deselect all</button>
                )}
                <span className="tally-page__selected-count">
                  {selected.size} selected
                  {selected.size > 0 && (
                    <> — ₹{fmt(vouchers.filter((v) => selected.has(v.id)).reduce((s, v) => s + (parseFloat(v.amount) || 0), 0))}</>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={selected.size === 0 || exporting || !tallyConfig}
                  onClick={handleExport}
                >
                  {exporting ? 'Generating…' : `Download Tally XML (${selected.size})`}
                </button>
                {tallyConfig?.tally_server_url && (
                  <button
                    type="button"
                    className="btn"
                    disabled={selected.size === 0 || pushing || !tallyConfig}
                    onClick={handlePush}
                  >
                    {pushing ? 'Pushing…' : 'Push to Tally'}
                  </button>
                )}
              </div>

              {/* Voucher table */}
              <div className="tally-table-wrap">
                <table className="tally-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Serial No</th>
                      <th>Payee</th>
                      <th className="text-right">Amount (₹)</th>
                      <th>Mode</th>
                      <th>Head</th>
                      <th>Approved</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v) => {
                      const isExported = !!exportedMap[v.id];
                      return (
                        <tr key={v.id} className={`tally-table__row${isExported ? ' tally-table__row--exported' : ''}`}>
                          <td>
                            {isExported ? (
                              <span className="tally-table__check">✓</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={selected.has(v.id)}
                                onChange={() => toggleSelect(v.id)}
                              />
                            )}
                          </td>
                          <td className="mono">{v.serial_number}</td>
                          <td>{v.payee_name}</td>
                          <td className="text-right mono">{fmt(v.amount)}</td>
                          <td><span className={`badge badge--${v.payment_mode === 'Cash' ? 'warning' : v.payment_mode === 'UPI' ? 'info' : 'teal'}`}>{MODE_LABELS[v.payment_mode] || v.payment_mode}</span></td>
                          <td className="tally-table__head">{v.head_of_account}{v.sub_head_of_account ? ` / ${v.sub_head_of_account}` : ''}</td>
                          <td>{fmtDate(v.approved_at)}</td>
                          <td>
                            {isExported ? (
                              <span className="badge badge--success">Exported ✓ <span className="tally-table__exp-date">{fmtDate(exportedMap[v.id])}</span></span>
                            ) : (
                              <span className="badge badge--muted">{v.status}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === 'history' && (
        <>
          {historyLoading ? (
            <LoadingSpinner />
          ) : batches.length === 0 ? (
            <div className="card tally-page__empty"><p>No export history yet.</p></div>
          ) : (
            <div className="tally-table-wrap">
              <table className="tally-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Batch</th>
                    <th>Date</th>
                    <th className="text-right">Vouchers</th>
                    <th className="text-right">Total (₹)</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => {
                    const bKey = batch.batch_id || batch.records[0]?.id;
                    const isExpanded = expandedBatch === bKey;
                    return (
                      <Fragment key={bKey}>
                        <tr
                          className="tally-table__row tally-table__row--batch"
                          onClick={() => setExpandedBatch(isExpanded ? null : bKey)}
                        >
                          <td className="tally-table__expand">{isExpanded ? '▾' : '▸'}</td>
                          <td className="mono">{(batch.batch_id || '—').slice(0, 8)}</td>
                          <td>{fmtDate(batch.exported_at)}</td>
                          <td className="text-right">{batch.records.length}</td>
                          <td className="text-right mono">{fmt(batch.totalAmount)}</td>
                          <td><span className={`badge badge--${batch.export_status === 'exported' ? 'success' : batch.export_status === 'failed' ? 'error' : 'warning'}`}>{batch.export_status}</span></td>
                          <td>
                            <button type="button" className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleRedownload(batch); }}>
                              Re-download
                            </button>
                          </td>
                        </tr>
                        {isExpanded && batch.records.map((r) => (
                          <tr key={r.id} className="tally-table__row tally-table__row--detail">
                            <td></td>
                            <td className="mono">{r.voucher_serial}</td>
                            <td>{r.payee_name}</td>
                            <td className="text-right mono">{fmt(r.voucher_amount)}</td>
                            <td>{r.payment_mode}</td>
                            <td colSpan="2">{fmtDate(r.voucher_date)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
