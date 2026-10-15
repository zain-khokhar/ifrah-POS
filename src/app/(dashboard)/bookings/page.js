'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  BookOpen, Plus, Search, X, RefreshCw,
  Edit, Trash2, Printer, FileText, Download, Clock,
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';
import ActionMenu from '@/lib/ActionMenu.js/actionMenu';
import { useRouter } from 'next/navigation';

const STATUS_CHIP = {
  None: { bg: '#f1f5f9', color: '#64748b', label: 'None' },
  Open: { bg: '#dbeafe', color: '#1d4ed8', label: 'Open' },
  Pending: { bg: '#fef3c7', color: '#d97706', label: 'Pending' },
  Closed: { bg: '#dcfce7', color: '#16a34a', label: 'Closed' },
};

function StatusChip({ status }) {
  const s = STATUS_CHIP[status] || STATUS_CHIP.None;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 20, fontSize: 11.5, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

const QUICK_BUTTONS = [
  { id: 'all',       label: 'Sabhi Bookings' },
  { id: 'today',     label: 'Aaj (Today)' },
  { id: 'tomorrow',  label: 'Kal (Tomorrow)' },
  { id: 'next2days', label: 'Agley 2 Din' },
  { id: 'custom',    label: '📅 Custom Date' },
];

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}
function getTomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function getNext2DaysIso() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

function formatDateDDMMYYYY(val, fallback = '—') {
  if (!val) return fallback;
  try {
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return fallback;
      const d = String(val.getDate()).padStart(2, '0');
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const y = val.getFullYear();
      return `${d}-${m}-${y}`;
    }
    const s = String(val).trim();
    if (!s) return fallback;

    const dateOnly = s.split('T')[0].split(' ')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4 && parts[1].length <= 2 && parts[2].length <= 2) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${d}-${m}-${y}`;
      }
      if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2];
        return `${d}-${m}-${y}`;
      }
    }
    const dObj = new Date(s);
    if (!isNaN(dObj.getTime())) {
      const d = String(dObj.getDate()).padStart(2, '0');
      const m = String(dObj.getMonth() + 1).padStart(2, '0');
      const y = dObj.getFullYear();
      return `${d}-${m}-${y}`;
    }
    return s;
  } catch {
    return fallback;
  }
}

function parseDateSafe(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  const dateOnly = s.split('T')[0].split(' ')[0];
  const parts = dateOnly.split('-');
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      return isNaN(d.getTime()) ? null : d;
    }
    if (parts[0].length === 4) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatBookingDateTime(bookingDate, createdAt) {
  const rawDate = bookingDate || (createdAt ? createdAt.slice(0, 10) : '');
  const dateStr = formatDateDDMMYYYY(rawDate);
  let timeStr = '';
  if (createdAt) {
    try {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) {
        timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    } catch (e) {}
  }
  return { dateStr, timeStr };
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateField, setDateField] = useState('booking_date');
  const [quickRange, setQuickRange] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const [deleting, setDeleting] = useState(null);
  const [userRole, setUserRole] = useState('viewer');
  const [printBookingId, setPrintBookingId] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const reloadRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    window.electronAPI?.auth.session().then(r => { if (r?.ok) setUserRole(r.user.role); });
  }, []);

  useEffect(() => {
    async function fetchBookings() {
      setLoading(true);
      const res = await window.electronAPI?.bookings.list({
        search: search || '',
        status: status || '',
        dateField,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
      if (res?.ok) setBookings(res.data || []);
      setLoading(false);
    }
    reloadRef.current = fetchBookings;
    fetchBookings();
  }, [search, status, dateField, dateFrom, dateTo]);

  function handleQuickRange(id) {
    setQuickRange(id);
    if (id === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (id === 'today') {
      const t = getTodayIso();
      setDateFrom(t);
      setDateTo(t);
    } else if (id === 'tomorrow') {
      const tm = getTomorrowIso();
      setDateFrom(tm);
      setDateTo(tm);
    } else if (id === 'next2days') {
      const t = getTodayIso();
      const n2 = getNext2DaysIso();
      setDateFrom(t);
      setDateTo(n2);
    } else if (id === 'custom') {
      if (!dateFrom) setDateFrom(getTodayIso());
    }
  }

  function handleClear() {
    setSearch('');
    setStatus('');
    setQuickRange('all');
    setDateField('booking_date');
    setDateFrom('');
    setDateTo('');
  }

  async function handleExport(kind) {
    setExporting(kind);
    try {
      const filters = {
        search: search || '',
        status: status || '',
        dateField,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      };
      const api = window.electronAPI?.reports;
      const res = kind === 'pdf'
        ? await api?.exportPdf({ reportType: 'bookings_report', filters })
        : await api?.exportExcel({ reportType: 'bookings_report', filters });
      if (res?.ok && !res.canceled) {
        alert(`✓ Bookings ${kind === 'pdf' ? 'PDF' : 'Excel'} saved: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete(b) {
    if (!window.confirm(`Booking #${b.booking_no} delete karein? Ye booking database se permanently delete ho jayegi.`)) return;
    setDeleting(b.id);
    const res = await window.electronAPI?.bookings.delete(b.id);
    if (res?.ok === false) alert(res.message || 'Delete failed.');
    else if (reloadRef.current) reloadRef.current();
    setDeleting(null);
  }

  const isOwner = userRole === 'owner';
  const isViewer = userRole === 'viewer';

  const totalGrand = bookings.reduce((s, b) => s + (b.grand_total || 0), 0);
  const totalRemain = bookings.reduce((s, b) => s + (b.remaining || 0), 0);

  const hasActiveFilters = Boolean(search || status || quickRange !== 'all' || dateFrom || dateTo);

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">
            {loading ? 'Loading…' : `${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => reloadRef.current?.()}
            title="Refresh Karein"
            style={{ gap: 5 }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>

          {/* Export to PDF */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleExport('pdf')}
            disabled={!!exporting}
            title="Current filters ke mutabiq PDF export"
            style={{ gap: 6, fontWeight: 600, color: '#0f172a' }}
          >
            <FileText size={13} style={{ color: '#7c3aed' }} />
            {exporting === 'pdf' ? 'Exporting...' : 'Export to PDF'}
          </button>

          {/* Export to Excel */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleExport('excel')}
            disabled={!!exporting}
            title="Current filters ke mutabiq Excel export"
            style={{ gap: 6, fontWeight: 600, color: '#0f172a' }}
          >
            <Download size={13} style={{ color: '#10b981' }} />
            {exporting === 'excel' ? 'Exporting...' : 'Export to Excel'}
          </button>

          {!isViewer && (
            <Link href="/bookings/new" className="btn btn-primary btn-sm" style={{ fontWeight: 700, gap: 5 }}>
              <Plus size={15} /> New Booking
            </Link>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* ── Filters Section ──────────────────────────────── */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          {/* Row 1: Quick Range Pills & Date Field Selector */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {QUICK_BUTTONS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleQuickRange(f.id)}
                  className={`btn btn-sm ${quickRange === f.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontWeight: quickRange === f.id ? 700 : 500,
                    fontSize: 12.5,
                    padding: '5px 12px',
                    borderRadius: 20,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#475569' }}>Date Field:</span>
              <select
                className="form-input form-select"
                style={{ width: 175, height: 34, fontSize: 12.5, fontWeight: 600 }}
                value={dateField}
                onChange={e => setDateField(e.target.value)}
              >
                <option value="booking_date">Booking Date (بکنگ)</option>
                <option value="delivery_date">Delivery Date (ڈلیوری)</option>
                <option value="returning_date">Return Date (واپسی)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Custom Date Inputs (when active) */}
          {quickRange === 'custom' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 600, color: '#334155', background: '#f8fafc', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <span style={{ color: '#64748b' }}>
                {dateField === 'delivery_date' ? 'Delivery Date Range' : dateField === 'returning_date' ? 'Return Date Range' : 'Booking Date Range'}:
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>From</span>
              <input
                type="date"
                className="form-input"
                style={{ width: 150, height: 32, fontSize: 12.5 }}
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
              {dateFrom && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 7px', borderRadius: 4 }}>
                  {formatDateDDMMYYYY(dateFrom)}
                </span>
              )}
              <span style={{ fontSize: 12, color: '#64748b' }}>se To</span>
              <input
                type="date"
                className="form-input"
                style={{ width: 150, height: 32, fontSize: 12.5 }}
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => setDateTo(e.target.value)}
              />
              {dateTo && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 7px', borderRadius: 4 }}>
                  {formatDateDDMMYYYY(dateTo)}
                </span>
              )}
            </div>
          )}

          {/* Row 3: Search & Status Dropdown & Clear */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}
              />
              <input
                className="form-input"
                style={{ paddingLeft: 36, height: 36, fontSize: 13 }}
                placeholder="Booking ID, customer name, phone, CNIC..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#475569' }}>Status:</span>
              <select
                className="form-input form-select"
                style={{ width: 145, height: 36, fontSize: 13 }}
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                <option value="">All (تمام)</option>
                <option value="None">None</option>
                <option value="Open">Open</option>
                <option value="Pending">Pending</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ height: 36, padding: '0 12px', whiteSpace: 'nowrap', gap: 4 }}
                onClick={handleClear}
                title="Tamam filters reset karein"
              >
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Table Card ────────────────────────────────────── */}
        <div className="card" style={{ width: '100%', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <div>Loading bookings...</div>
            </div>
          ) : bookings.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
              <BookOpen size={44} style={{ marginBottom: 12, opacity: 0.35 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                {hasActiveFilters ? 'Koi booking nahi mili' : 'Abhi koi booking nahi hai'}
              </div>
              <div style={{ fontSize: 13 }}>
                {hasActiveFilters ? 'Filters reset karein ya alag date range search karein.' : 'Pehli booking banayein.'}
              </div>
              {!isViewer && !hasActiveFilters && (
                <Link href="/bookings/new" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>
                  <Plus size={14} /> Pehli Booking Banayein
                </Link>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Booking #</th>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Dresses / Ordered</th>
                    <th>Booked Date & Time</th>
                    <th>Delivery</th>
                    <th>Return</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Remaining</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => (
                    <tr key={b.id}>
                      {/* Booking # */}
                      <td>
                        <Link
                          href={`/bookings/new?id=${b.id}`}
                          style={{
                            fontWeight: 800,
                            color: '#7c3aed',
                            fontFamily: 'monospace',
                            fontSize: 14,
                            textDecoration: 'none',
                          }}
                        >
                          #{b.booking_no}
                        </Link>
                      </td>

                      {/* Customer */}
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{b.customer_name || '—'}</td>

                      {/* Contact */}
                      <td style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#64748b' }}>{b.customer_phone || '—'}</td>

                      {/* Dresses / Ordered with quantity */}
                      <td>
                        {b.dresses_summary ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 220 }}>
                            {b.dresses_summary.split(', ').map((item, idx) => (
                              <span
                                key={idx}
                                style={{
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 5,
                                  padding: '2px 7px',
                                  color: '#1e293b',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  width: 'fit-content',
                                  lineHeight: 1.3,
                                }}
                              >
                                <span>👗</span>
                                <span>{item}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Booked Date & Time */}
                      <td>
                        {(() => {
                          const { dateStr, timeStr } = formatBookingDateTime(b.booking_date, b.created_at);
                          return (
                            <div>
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 12.5 }}>
                                {dateStr}
                              </div>
                              {timeStr ? (
                                <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                                  <Clock size={11} style={{ color: '#7c3aed' }} />
                                  <span>{timeStr}</span>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Delivery Date */}
                      <td>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{formatDateDDMMYYYY(b.delivery_date)}</div>
                        {b.delivered_on ? (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                            ✓ Delivered
                          </span>
                        ) : (
                          <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Pending</span>
                        )}
                      </td>

                      {/* Returning Date */}
                      <td>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{formatDateDDMMYYYY(b.returning_date)}</div>
                        {b.returned_on ? (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                            ✓ Returned {b.return_condition ? `(${b.return_condition})` : ''}
                          </span>
                        ) : (() => {
                          const isOverdue = (() => {
                            if (!b.delivered_on || !b.returning_date || b.returned_on) return false;
                            const d = parseDateSafe(b.returning_date);
                            if (!d) return false;
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            d.setHours(0, 0, 0, 0);
                            return d < today;
                          })();
                          return isOverdue ? (
                            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                              ⚠️ Overdue
                            </span>
                          ) : (
                            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Awaiting</span>
                          );
                        })()}
                      </td>

                      {/* Status */}
                      <td>
                        <StatusChip status={b.status} />
                        {b.clash_flag === 1 && (
                          <div style={{ marginTop: 2 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#e11d48', background: '#ffe4e6', padding: '1px 6px', borderRadius: 4, display: 'inline-block' }}>
                              ⚠️ Needs a look
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Grand Total */}
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {b.grand_total > 0 ? `Rs. ${b.grand_total.toLocaleString()}` : '—'}
                      </td>

                      {/* Remaining */}
                      <td style={{ textAlign: 'right', fontWeight: 700, color: b.remaining > 0 ? '#ef4444' : '#10b981' }}>
                        {b.grand_total > 0 ? `Rs. ${b.remaining.toLocaleString()}` : '—'}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <ActionMenu
                            items={[
                              {
                                key: 'receipt',
                                label: 'Receipt',
                                icon: <Printer size={13} />,
                                onClick: () => {
                                  setPrintBookingId(b.id);
                                  setShowReceiptModal(true);
                                },
                              },
                              !isViewer && {
                                key: 'edit',
                                label: 'Edit',
                                icon: <Edit size={13} />,
                                onClick: () => router.push(`/bookings/new?id=${b.id}`),
                              },
                              isOwner && {
                                key: 'delete',
                                label: deleting === b.id ? '...' : 'Delete',
                                icon: <Trash2 size={13} />,
                                color: '#ef4444',
                                disabled: deleting === b.id,
                                onClick: () => handleDelete(b),
                              },
                            ].filter(Boolean)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {bookings.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', alignItems: 'center' }}>
              <span>{bookings.length} booking{bookings.length !== 1 ? 's' : ''}{hasActiveFilters ? ' (filtered)' : ''}</span>
              <div style={{ display: 'flex', gap: 24, fontWeight: 800, color: '#0f172a' }}>
                <span>Total: Rs. {totalGrand.toLocaleString()}</span>
                <span style={{ color: totalRemain > 0 ? '#ef4444' : '#10b981' }}>
                  Remaining: Rs. {totalRemain.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PHASE 8: RECEIPT MODAL ── */}
      {showReceiptModal && printBookingId && (
        <ReceiptModal
          bookingId={printBookingId}
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            setPrintBookingId(null);
          }}
          onPrintComplete={() => {
            if (reloadRef.current) reloadRef.current();
          }}
        />
      )}
    </div>
  );
}
