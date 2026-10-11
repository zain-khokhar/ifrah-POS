'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  FileText, Truck, RotateCcw, Users, Shirt, CreditCard,
  AlertTriangle, Download, Printer, FileSpreadsheet,
  Calendar, Search, X, RefreshCw, CheckCircle2, Lock,
  Sparkles, Layers,
} from 'lucide-react';

const REPORT_CATEGORIES = [
  {
    title: 'Daily Operations (روزانہ آپریشنل رپورٹس)',
    items: [
      {
        id: 'delivery_sheet',
        label: 'Delivery Sheet',
        urdu: 'ڈلیوری شیٹ',
        desc: 'Today, tomorrow & upcoming delivery schedules with full dress notes',
        icon: Truck,
        color: '#3b82f6',
        bg: '#dbeafe',
        ownerOnly: false,
      },
      {
        id: 'prepare_dryclean',
        label: 'Prepare & Dry-Clean',
        urdu: 'تیاری اور ڈرائی کلین لسٹ',
        desc: 'Dresses leaving in next 2 days + returned dresses needing cleaning',
        icon: Shirt,
        color: '#10b981',
        bg: '#dcfce7',
        ownerOnly: false,
      },
      {
        id: 'returns_overdue',
        label: 'Returns & Overdue',
        urdu: 'واپسی اور اوور ڈیو رپورٹ',
        desc: 'Dresses expected back or overdue with exact days late and deposit tracking',
        icon: RotateCcw,
        color: '#ef4444',
        bg: '#fee2e2',
        ownerOnly: false,
      },
      {
        id: 'customer_report',
        label: 'Customer Report (BDR)',
        urdu: 'کسٹمر بکنگز رپورٹ',
        desc: 'Complete booking ledger replacing legacy BDRCustomer with full money totals',
        icon: Users,
        color: '#8b5cf6',
        bg: '#ede9fe',
        ownerOnly: false,
      },
      {
        id: 'customers_month',
        label: 'Customers This Month',
        urdu: 'اس مہینے کے کسٹمرز',
        desc: 'Unique customer activity, booking frequencies and city breakdown',
        icon: Users,
        color: '#06b6d4',
        bg: '#cffafe',
        ownerOnly: false,
      },
      {
        id: 'today_open_accounts',
        label: "Today's Open Accounts",
        urdu: 'آج کے اوپن اکاؤنٹس',
        desc: 'Open bookings whose dresses go out today',
        icon: FileText,
        color: '#f59e0b',
        bg: '#fef3c7',
        ownerOnly: false,
      },
      {
        id: 'dress_report',
        label: 'Dress Clash & Utilization',
        urdu: 'ڈریس استعمال و کلیش رپورٹ',
        desc: 'Dress booking frequency, accessories snapshot and same-day clash detection',
        icon: Shirt,
        color: '#ec4899',
        bg: '#fce7f3',
        ownerOnly: false,
      },
    ],
  },
  {
    title: 'Financial & Audit (مالیاتی رپورٹس — Owner Only)',
    items: [
      {
        id: 'daily_cash',
        label: 'Daily Cash by Method',
        urdu: 'روزانہ کیش و بینک رپورٹ',
        desc: 'Collections by Cash vs Bank Transfer, rentals vs deposits',
        icon: CreditCard,
        color: '#059669',
        bg: '#d1fae5',
        ownerOnly: true,
      },
      {
        id: 'outstanding_balances',
        label: 'Outstanding Balances',
        urdu: 'بقایا جات کی رپورٹ',
        desc: 'All unpaid customer balances sorted oldest delivery first',
        icon: AlertTriangle,
        color: '#d97706',
        bg: '#fef3c7',
        ownerOnly: true,
      },
    ],
  },
];

function ReportsContent() {
  const searchParams = useSearchParams();
  const initialType = searchParams?.get('type') || 'delivery_sheet';

  const [activeReport, setActiveReport] = useState(initialType);
  const [reportData, setReportData]     = useState(null);
  const [loading, setLoading]           = useState(true);
  const [userRole, setUserRole]         = useState('viewer');
  const [actionMessage, setActionMessage] = useState('');

  // Filters State
  const [range, setRange]       = useState('today'); // today, tomorrow, next2days, custom
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [cityId, setCityId]     = useState('');
  const [month, setMonth]       = useState(new Date().toISOString().slice(0, 7));
  const [cities, setCities]     = useState([]);

  // Export progress states
  const [exportingExcel, setExportingExcel]         = useState(false);
  const [exportingPdf, setExportingPdf]             = useState(false);
  const [printing, setPrinting]                     = useState(false);
  const [printingPack, setPrintingPack]             = useState(false);
  const [exportingAll, setExportingAll]             = useState(false);

  const reloadRef = useRef(null);

  useEffect(() => {
    window.electronAPI?.auth?.session().then(r => {
      if (r?.ok) setUserRole(r.user.role);
    });
    window.electronAPI?.lists?.get('cities').then(r => {
      if (r?.ok) setCities(r.data || []);
    });
  }, []);

  // Fetch report data
  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      setActionMessage('');
      try {
        const filters = {
          range,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          cityId: cityId || undefined,
          month: month || undefined,
        };

        const res = await window.electronAPI?.reports?.get({
          reportType: activeReport,
          filters,
        });

        if (res?.ok) {
          setReportData(res.data);
        } else {
          setReportData(null);
          if (res?.message) {
            setActionMessage(`Error: ${res.message}`);
          }
        }
      } catch (err) {
        console.error('Failed to load report:', err);
        setReportData(null);
      } finally {
        setLoading(false);
      }
    }

    reloadRef.current = fetchReport;
    fetchReport();
  }, [activeReport, range, dateFrom, dateTo, cityId, month]);

  // Export to Excel handler
  async function handleExportExcel() {
    setExportingExcel(true);
    setActionMessage('');
    try {
      const res = await window.electronAPI?.reports?.exportExcel({
        reportType: activeReport,
        filters: { range, dateFrom, dateTo, cityId, month },
      });
      if (res?.ok && !res.canceled) {
        setActionMessage(`✓ Excel file saved successfully: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`Excel export failed: ${err.message}`);
    } finally {
      setExportingExcel(false);
    }
  }

  // Export to PDF handler
  async function handleExportPdf() {
    setExportingPdf(true);
    setActionMessage('');
    try {
      const res = await window.electronAPI?.reports?.exportPdf({
        reportType: activeReport,
        filters: { range, dateFrom, dateTo, cityId, month },
      });
      if (res?.ok && !res.canceled) {
        setActionMessage(`✓ PDF file saved successfully: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`PDF export failed: ${err.message}`);
    } finally {
      setExportingPdf(false);
    }
  }

  // Direct print handler
  async function handlePrint() {
    setPrinting(true);
    setActionMessage('');
    try {
      const res = await window.electronAPI?.reports?.print({
        reportType: activeReport,
        filters: { range, dateFrom, dateTo, cityId, month },
      });
      if (res?.ok) {
        setActionMessage('✓ Report sent to printer successfully.');
      } else if (res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`Print failed: ${err.message}`);
    } finally {
      setPrinting(false);
    }
  }

  // 1-Click Daily Pack Print handler
  async function handlePrintDailyPack() {
    if (!window.confirm('Daily Pack ke 3 zaroori reports (Delivery Sheet, Prepare/Dry-Clean, Returns Due) print karein?')) {
      return;
    }
    setPrintingPack(true);
    setActionMessage('');
    try {
      const res = await window.electronAPI?.reports?.printDailyPack({});
      if (res?.ok) {
        setActionMessage('✓ Daily Pack (3 reports) sent to printer successfully.');
      } else if (res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`Daily Pack print failed: ${err.message}`);
    } finally {
      setPrintingPack(false);
    }
  }

  // Export Everything to Excel (5 tabs) handler
  async function handleExportEverything() {
    if (userRole !== 'owner') {
      alert('Ye feature sirf Owner ke liye makhsoos hai.');
      return;
    }
    setExportingAll(true);
    setActionMessage('');
    try {
      const res = await window.electronAPI?.reports?.exportEverything({});
      if (res?.ok && !res.canceled) {
        setActionMessage(`✓ Complete System Backup Excel saved: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`Full export failed: ${err.message}`);
    } finally {
      setExportingAll(false);
    }
  }

  const isOwner = userRole === 'owner';

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Exports</h1>
          <p className="page-subtitle">Business intelligence, daily operational packs aur Excel/PDF exports</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Daily Pack 1-Click Print */}
          {userRole !== 'viewer' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handlePrintDailyPack}
              disabled={printingPack}
              title="Prints 3 operational reports in 1 click (Delivery Sheet, Prepare & Returns)"
              style={{ fontWeight: 700, borderColor: '#7c3aed', color: '#7c3aed' }}
            >
              <Sparkles size={13} /> {printingPack ? 'Printing Pack...' : 'Print Daily Pack (3 Reports)'}
            </button>
          )}

          {/* Export Everything (Owner Only) */}
          {isOwner && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExportEverything}
              disabled={exportingAll}
              title="Export all 5 core tables to a single Excel workbook for complete offline backup"
              style={{ fontWeight: 700, borderColor: '#059669', color: '#059669' }}
            >
              <Layers size={13} /> {exportingAll ? 'Exporting All...' : 'Export Everything to Excel'}
            </button>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => reloadRef.current?.()}
            title="Refresh Karein"
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div className="page-body">
        {actionMessage && (
          <div style={{
            background: actionMessage.startsWith('✓') ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${actionMessage.startsWith('✓') ? '#bbf7d0' : '#fecaca'}`,
            color: actionMessage.startsWith('✓') ? '#166534' : '#991b1b',
            borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>{actionMessage}</span>
            <button
              onClick={() => setActionMessage('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Two Column Layout: Left Sidebar + Right Content ──── */}
        <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 18, alignItems: 'start' }}>

          {/* ── Left Sidebar: Report Selector ─────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {REPORT_CATEGORIES.map(cat => (
              <div key={cat.title} className="card" style={{ padding: 12 }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                  letterSpacing: 0.5, color: '#64748b', marginBottom: 10, paddingLeft: 4,
                }}>
                  {cat.title}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cat.items.map(item => {
                    const isSelected = activeReport === item.id;
                    const isLocked = item.ownerOnly && !isOwner;
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (!isLocked) setActiveReport(item.id);
                        }}
                        disabled={isLocked}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: isSelected ? '1px solid #7c3aed' : '1px solid transparent',
                          background: isSelected ? '#f5f3ff' : isLocked ? '#f8fafc' : 'transparent',
                          color: isSelected ? '#7c3aed' : isLocked ? '#94a3b8' : '#334155',
                          cursor: isLocked ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                          opacity: isLocked ? 0.6 : 1,
                        }}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: item.bg, color: item.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {isLocked ? <Lock size={13} /> : <Icon size={14} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: isSelected ? 800 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 10.5, color: isSelected ? '#6d28d9' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.urdu}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── Right Content: Filter Bar & Report Viewer ──────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Top Filter Bar & Actions ───────────────────────── */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                {/* Date and Quick Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {activeReport === 'delivery_sheet' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[
                        { id: 'today', label: 'Aaj (Today)' },
                        { id: 'tomorrow', label: 'Kal' },
                        { id: 'next2days', label: 'Agley 2 Din' },
                        { id: 'custom', label: 'Custom Date' },
                      ].map(r => (
                        <button
                          key={r.id}
                          className={`btn btn-sm ${range === r.id ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setRange(r.id)}
                          style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 20 }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {activeReport === 'customer_report' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Month:</span>
                      <input
                        type="month"
                        className="form-input"
                        style={{ height: 32, fontSize: 12, width: 140 }}
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                      />
                    </div>
                  )}

                  {activeReport === 'customers_month' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Month:</span>
                      <input
                        type="month"
                        className="form-input"
                        style={{ height: 32, fontSize: 12, width: 140 }}
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Custom Date Pickers */}
                  {(range === 'custom' || activeReport === 'daily_cash' || activeReport === 'dress_report') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>From:</span>
                      <input
                        type="date"
                        className="form-input"
                        style={{ height: 32, fontSize: 12 }}
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                      />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>To:</span>
                      <input
                        type="date"
                        className="form-input"
                        style={{ height: 32, fontSize: 12 }}
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                      />
                    </div>
                  )}

                  {/* City Filter */}
                  {(activeReport === 'delivery_sheet' || activeReport === 'customer_report') && (
                    <select
                      className="form-input form-select"
                      style={{ height: 32, fontSize: 12, width: 130 }}
                      value={cityId}
                      onChange={e => setCityId(e.target.value)}
                    >
                      <option value="">All Cities</option>
                      {cities.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}

                  {(dateFrom || dateTo || cityId || range === 'custom') && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                        setCityId('');
                        setRange('today');
                      }}
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      <X size={11} /> Clear
                    </button>
                  )}
                </div>

                {/* Export & Action Buttons */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handlePrint}
                    disabled={printing || loading || !reportData}
                    style={{ fontWeight: 700 }}
                  >
                    <Printer size={13} /> {printing ? 'Printing...' : 'Print'}
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleExportPdf}
                    disabled={exportingPdf || loading || !reportData}
                    style={{ fontWeight: 700 }}
                  >
                    <Download size={13} /> {exportingPdf ? 'Saving...' : 'PDF'}
                  </button>

                  <button
                    className="btn btn-sm"
                    onClick={handleExportExcel}
                    disabled={exportingExcel || loading || !reportData}
                    style={{
                      background: '#16a34a',
                      color: 'white',
                      border: 'none',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 12px',
                      borderRadius: 6,
                    }}
                  >
                    <FileSpreadsheet size={14} /> {exportingExcel ? 'Exporting...' : 'Excel (.xlsx)'}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Report Title & Details Card ────────────────────── */}
            {reportData && (
              <div style={{
                background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                borderRadius: 10, border: '1px solid #e2e8f0',
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: 10,
              }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {reportData.title}
                  </h2>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {reportData.subtitle}
                  </div>
                </div>
                {reportData.filtersSummary && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#6d28d9',
                    background: '#ede9fe', padding: '3px 10px', borderRadius: 20,
                  }}>
                    {reportData.filtersSummary}
                  </span>
                )}
              </div>
            )}

            {/* ── Report Data Table ──────────────────────────────── */}
            <div className="card" style={{ overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                  <div>Report load ho rahi hai...</div>
                </div>
              ) : !reportData || !reportData.rows || reportData.rows.length === 0 ? (
                <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
                  <FileText size={44} style={{ opacity: 0.35, marginBottom: 10 }} />
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Koi record nahi mila
                  </div>
                  <div style={{ fontSize: 12.5 }}>
                    Muntakhib karda filters ke mutabiq koi data mojood nahi hai.
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: '68vh' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {reportData.columns.map(col => (
                          <th
                            key={col.key}
                            style={{
                              textAlign: col.align === 'right' || col.isMoney ? 'right' : col.align === 'center' || col.isNum ? 'center' : 'left',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.rows.map((row, idx) => (
                        <tr key={row.id || idx}>
                          {reportData.columns.map(col => {
                            const val = row[col.key];

                            if (col.isMoney) {
                              const num = Number(val || 0);
                              return (
                                <td key={col.key} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                                  {num > 0 ? `Rs. ${num.toLocaleString()}` : '—'}
                                </td>
                              );
                            }

                            if (col.isNum) {
                              return (
                                <td key={col.key} style={{ textAlign: 'center', fontWeight: 600 }}>
                                  {val ?? '—'}
                                </td>
                              );
                            }

                            if (col.key === 'status') {
                              return (
                                <td key={col.key}>
                                  <span className={`badge ${
                                    val === 'Closed' ? 'badge-success' : val === 'Open' ? 'badge-primary' : 'badge-warning'
                                  }`}>
                                    {val}
                                  </span>
                                </td>
                              );
                            }

                            if (col.key === 'is_ready_text') {
                              return (
                                <td key={col.key}>
                                  <span className={`badge ${val === 'Ready' ? 'badge-success' : 'badge-secondary'}`}>
                                    {val}
                                  </span>
                                </td>
                              );
                            }

                            if (col.key === 'status_label' && row.is_overdue) {
                              return (
                                <td key={col.key}>
                                  <span className="badge badge-danger">
                                    {val}
                                  </span>
                                </td>
                              );
                            }

                            return (
                              <td key={col.key} style={{ fontSize: 12.5 }}>
                                {val ?? '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>

                    {/* Totals Summary Row in Table Footer */}
                    {reportData.totals && (
                      <tfoot>
                        <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                          {reportData.columns.map((col, idx) => {
                            if (idx === 0) {
                              return (
                                <td key={col.key} style={{ fontWeight: 800, color: '#0f172a' }}>
                                  TOTAL ({reportData.rows.length})
                                </td>
                              );
                            }
                            if (reportData.totals[col.key] !== undefined) {
                              const tVal = reportData.totals[col.key];
                              if (col.isMoney) {
                                return (
                                  <td key={col.key} style={{ textAlign: 'right', fontWeight: 800, color: '#7c3aed', fontFamily: 'monospace' }}>
                                    Rs. {Number(tVal || 0).toLocaleString()}
                                  </td>
                                );
                              }
                              return (
                                <td key={col.key} style={{ textAlign: 'center', fontWeight: 800 }}>
                                  {tVal}
                                </td>
                              );
                            }
                            return <td key={col.key}></td>;
                          })}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}

              {/* ── Footer Stats Summary ─────────────────────────── */}
              {reportData && reportData.totals && (
                <div style={{
                  padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
                }}>
                  <div style={{ color: '#64748b' }}>
                    Showing <strong>{reportData.rows?.length || 0}</strong> records
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontWeight: 700 }}>
                    {reportData.totals.grand_total !== undefined && (
                      <span style={{ color: '#0f172a' }}>
                        Total Value: Rs. {Number(reportData.totals.grand_total).toLocaleString()}
                      </span>
                    )}
                    {reportData.totals.amount_paid !== undefined && (
                      <span style={{ color: '#16a34a' }}>
                        Total Paid: Rs. {Number(reportData.totals.amount_paid).toLocaleString()}
                      </span>
                    )}
                    {reportData.totals.remaining !== undefined && (
                      <span style={{ color: '#dc2626' }}>
                        Total Remaining: Rs. {Number(reportData.totals.remaining).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading Reports...</div>}>
      <ReportsContent />
    </Suspense>
  );
}
