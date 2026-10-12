'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Truck, CheckCircle2, RotateCcw, AlertCircle, Search, RefreshCw,
  Clock, Calendar, User, Phone, Check, X, ShieldAlert, DollarSign,
  PackageCheck, Printer, Download, FileText,
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';

const FILTERS = [
  { id: 'today',     label: 'Aaj (Today)' },
  { id: 'tomorrow',  label: 'Kal (Tomorrow)' },
  { id: 'next2days', label: 'Agley 2 Din' },
  { id: 'upcoming',  label: 'Agley 7 Din' },
  { id: 'pending',   label: 'Pending' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'all',       label: 'Sabhi' },
];

function DeliveriesContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams?.get('filter') || 'today';

  const [filter, setFilter]         = useState(initialFilter);
  const [search, setSearch]         = useState('');
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [userRole, setUserRole]     = useState('viewer');

  // Export State
  const [exportingPdf, setExportingPdf]     = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [actionMessage, setActionMessage]   = useState('');

  // Mark Delivered Modal State
  const [deliveryModalItem, setDeliveryModalItem] = useState(null);
  const [deliveryDate, setDeliveryDate]           = useState('');
  const [deliveryNote, setDeliveryNote]           = useState('');
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  // Receipt Modal State
  const [receiptBookingId, setReceiptBookingId]   = useState(null);
  const [togglingItemId, setTogglingItemId]       = useState(null);

  const reloadRef = useRef(null);

  useEffect(() => {
    window.electronAPI?.auth?.session().then(r => {
      if (r?.ok) setUserRole(r.user.role);
    });
  }, []);

  useEffect(() => {
    async function fetchDeliveries() {
      setLoading(true);
      try {
        let res = await window.electronAPI?.tracking?.listDeliveries({
          filter,
          search,
        });
        let data = res?.ok && Array.isArray(res.data) ? res.data : [];

        // Fallback for next2days if backend hasn't reloaded yet
        if (filter === 'next2days' && data.length === 0) {
          const upRes = await window.electronAPI?.tracking?.listDeliveries({
            filter: 'upcoming',
            search,
          });
          if (upRes?.ok && Array.isArray(upRes.data)) {
            const today = new Date().toISOString().slice(0, 10);
            const future = new Date();
            future.setDate(future.getDate() + 2);
            const next2Iso = future.toISOString().slice(0, 10);
            data = upRes.data.filter(b => b.delivery_date >= today && b.delivery_date <= next2Iso);
          }
        }

        setDeliveries(data);
      } catch (err) {
        console.error('Failed to load deliveries:', err);
        setDeliveries([]);
      } finally {
        setLoading(false);
      }
    }
    reloadRef.current = fetchDeliveries;
    fetchDeliveries();
  }, [filter, search]);

  // Per-item "Ready / Prepared" toggle (Night-before prep)
  async function handleToggleReady(itemId, currentVal) {
    if (userRole === 'viewer') return;
    setTogglingItemId(itemId);
    try {
      const res = await window.electronAPI?.tracking?.toggleItemReady({
        itemId,
        isReady: !currentVal,
      });
      if (res?.ok) {
        // Update local state without full reload
        setDeliveries(prev => prev.map(b => {
          const itemIdx = b.items?.findIndex(it => it.id === itemId);
          if (itemIdx === -1 || itemIdx === undefined) return b;
          const updatedItems = [...b.items];
          updatedItems[itemIdx] = { ...updatedItems[itemIdx], is_ready: !currentVal ? 1 : 0 };
          const readyCount = updatedItems.filter(it => it.is_ready === 1).length;
          return {
            ...b,
            items: updatedItems,
            ready_items: readyCount,
            all_ready: readyCount === updatedItems.length,
          };
        }));
      } else {
        alert(res?.message || 'Ready status update nahi ho saka.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred');
    } finally {
      setTogglingItemId(null);
    }
  }

  // Open Mark Delivered Modal
  function openDeliveryModal(booking) {
    setDeliveryModalItem(booking);
    setDeliveryDate(new Date().toISOString().slice(0, 10));
    setDeliveryNote('');
  }

  // Confirm Mark Delivered
  async function handleConfirmDelivered() {
    if (!deliveryModalItem) return;
    setSubmittingDelivery(true);
    try {
      const res = await window.electronAPI?.tracking?.markDelivered({
        bookingId: deliveryModalItem.id,
        deliveredOn: deliveryDate,
        deliveryNote: deliveryNote.trim(),
        allItemsReady: true,
      });
      if (res?.ok) {
        setDeliveryModalItem(null);
        await reloadRef.current?.();
      } else {
        alert(res?.message || 'Delivery mark nahi ho saki.');
      }
    } catch (err) {
      alert(err.message || 'Delivery mark karte waqt error aaya.');
    } finally {
      setSubmittingDelivery(false);
    }
  }

  // Unmark Delivered
  async function handleUnmarkDelivered(bookingId) {
    if (userRole === 'viewer') return;
    if (!window.confirm('Kya aap waqai is booking ki delivery wapas "Pending" karna chahte hain?')) {
      return;
    }
    try {
      const res = await window.electronAPI?.tracking?.unmarkDelivered(bookingId);
      if (res?.ok) {
        await reloadRef.current?.();
      } else {
        alert(res?.message || 'Unmark nahi ho saka.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred');
    }
  }

  // Export to PDF handler (in Daily Delivery Sheet format)
  async function handleExportPdf() {
    setExportingPdf(true);
    setActionMessage('');
    try {
      const res = await window.electronAPI?.reports?.exportPdf({
        reportType: 'delivery_sheet',
        filters: {
          filter,
          range: filter,
          search: search || '',
          excludeDelivered: filter !== 'delivered' && filter !== 'all',
        },
      });
      if (res?.ok && !res.canceled) {
        setActionMessage(`✓ Delivery Sheet PDF saved successfully: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`PDF export failed: ${err.message}`);
    } finally {
      setExportingPdf(false);
    }
  }

  // Export to Excel handler (in Daily Delivery Sheet format)
  async function handleExportExcel() {
    setExportingExcel(true);
    setActionMessage('');
    try {
      const res = await window.electronAPI?.reports?.exportExcel({
        reportType: 'delivery_sheet',
        filters: {
          filter,
          range: filter,
          search: search || '',
          excludeDelivered: filter !== 'delivered' && filter !== 'all',
        },
      });
      if (res?.ok && !res.canceled) {
        setActionMessage(`✓ Delivery Sheet Excel saved successfully: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`Excel export failed: ${err.message}`);
    } finally {
      setExportingExcel(false);
    }
  }

  // Filter out delivered bookings on active delivery lists (unless viewing delivered or all)
  const displayedDeliveries = deliveries.filter(d => {
    if (filter === 'delivered') return Boolean(d.delivered_on);
    if (filter === 'all') return true;
    // For today, tomorrow, next2days, upcoming, pending: do NOT show delivered bookings
    return !d.delivered_on;
  });

  const deliveredCount = deliveries.filter(d => Boolean(d.delivered_on)).length;
  const pendingCount   = displayedDeliveries.length;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Deliveries Tracker</h1>
          <p className="page-subtitle">Dresses ki tayyari aur customer ko delivery ka record</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
            onClick={handleExportPdf}
            disabled={exportingPdf}
            title="Daily Delivery Sheet format mein PDF export karein"
            style={{ gap: 6, fontWeight: 600, color: '#0f172a' }}
          >
            <FileText size={13} style={{ color: '#7c3aed' }} />
            {exportingPdf ? 'Exporting...' : 'Export to PDF'}
          </button>

          {/* Export to Excel */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportExcel}
            disabled={exportingExcel}
            title="Daily Delivery Sheet format mein Excel export karein"
            style={{ gap: 6, fontWeight: 600, color: '#0f172a' }}
          >
            <Download size={13} style={{ color: '#10b981' }} />
            {exportingExcel ? 'Exporting...' : 'Export to Excel'}
          </button>

          <span className="badge badge-warning" style={{ padding: '6px 12px', fontSize: 13 }}>
            {pendingCount} Pending
          </span>
          <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: 13 }}>
            {deliveredCount} Delivered
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Action Message Banner */}
        {actionMessage && (
          <div style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{actionMessage}</span>
            <button
              onClick={() => setActionMessage('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', padding: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* ── Filters & Search Bar ──────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontWeight: filter === f.id ? 700 : 500,
                  fontSize: 12.5,
                  padding: '5px 12px',
                  borderRadius: 20,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                pointerEvents: 'none',
              }}
            />
            <input
              className="form-input"
              style={{ paddingLeft: 36, height: 36, fontSize: 13 }}
              placeholder="Search booking #, customer, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Deliveries Table ──────────────────────────────── */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
              <div>Deliveries load ho rahi hain...</div>
            </div>
          ) : displayedDeliveries.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
              <Truck size={48} style={{ opacity: 0.35, marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Koi delivery nahi mili
              </div>
              <div style={{ fontSize: 13 }}>
                {filter === 'today'
                  ? 'Aaj ki date mein koi delivery scheduled nahi hai (ya sabhi deliver ho chuki hain).'
                  : 'Selected filter ke mutabiq koi record mojood nahi.'}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking #</th>
                    <th>Customer</th>
                    <th>Delivery Date</th>
                    <th>Return Date</th>
                    <th>Dresses & Preparation (Night-before Ready)</th>
                    <th style={{ textAlign: 'right' }}>Payment Due</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedDeliveries.map(d => {
                    const isDelivered = Boolean(d.delivered_on);
                    const remainingDue = Number(d.remaining || 0);

                    return (
                      <tr key={d.id} style={{ background: isDelivered ? '#fafafa' : '#ffffff' }}>
                        {/* Booking # */}
                        <td>
                          <Link
                            href={`/bookings/new?id=${d.id}`}
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              color: '#7c3aed',
                              fontSize: 14,
                              textDecoration: 'none',
                            }}
                            title="Open Booking"
                          >
                            #{d.booking_no}
                          </Link>
                          {d.status && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              {d.status}
                            </div>
                          )}
                        </td>

                        {/* Customer */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                            {d.customer_name || '—'}
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Phone size={11} /> {d.customer_phone || '—'}
                          </div>
                          {d.city && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.city}</div>
                          )}
                        </td>

                        {/* Delivery Date */}
                        <td>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>
                            {d.delivery_date}
                          </div>
                          {d.delivered_on && (
                            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Check size={11} /> Delivered: {d.delivered_on}
                            </div>
                          )}
                        </td>

                        {/* Return Date */}
                        <td>
                          <div style={{ fontSize: 13, color: '#475569' }}>
                            {d.returning_date || '—'}
                          </div>
                        </td>

                        {/* Dresses & Night-before Prep Checklist */}
                        <td style={{ minWidth: 260 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {d.items && d.items.length > 0 ? (
                              d.items.map(it => {
                                const isReady = Boolean(it.is_ready);
                                return (
                                  <div
                                    key={it.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      background: isReady ? '#ecfdf5' : '#f8fafc',
                                      border: isReady ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                                      fontSize: 12,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isReady}
                                      disabled={userRole === 'viewer' || togglingItemId === it.id}
                                      onChange={() => handleToggleReady(it.id, isReady)}
                                      title="Night-before Preparation Ready Tick"
                                      style={{ cursor: userRole === 'viewer' ? 'default' : 'pointer' }}
                                    />
                                    <span style={{
                                      fontWeight: isReady ? 700 : 500,
                                      color: isReady ? '#065f46' : '#334155',
                                      textDecoration: isReady ? 'none' : 'none',
                                      flex: 1,
                                    }}>
                                      {it.dress_name_snapshot}
                                      {it.size ? ` (${it.size})` : ''}
                                    </span>
                                    {isReady && (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '1px 6px', borderRadius: 10 }}>
                                        Ready
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <span style={{ color: '#64748b', fontSize: 12 }}>
                                {d.dresses_summary || 'Koi dress nahi'}
                              </span>
                            )}
                          </div>
                          {d.delivery_note && (
                            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
                              Note: {d.delivery_note}
                            </div>
                          )}
                        </td>

                        {/* Payment Remaining Due */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: remainingDue > 0 ? '#dc2626' : '#16a34a' }}>
                            {remainingDue > 0 ? `Rs. ${remainingDue.toLocaleString()}` : 'Fully Paid ✓'}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            Total: Rs. {Number(d.grand_total || 0).toLocaleString()}
                          </div>
                          {d.security_deposit > 0 && (
                            <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 1 }}>
                              Deposit: Rs. {Number(d.security_deposit).toLocaleString()}
                            </div>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td>
                          {isDelivered ? (
                            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={12} /> Delivered
                            </span>
                          ) : (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={12} /> Pending
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setReceiptBookingId(d.id)}
                              title="Print Receipt"
                              style={{ padding: '4px 8px' }}
                            >
                              <Printer size={13} />
                            </button>

                            {userRole !== 'viewer' && (
                              !isDelivered ? (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => openDeliveryModal(d)}
                                  style={{
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                  }}
                                >
                                  <CheckCircle2 size={13} /> Mark Delivered
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleUnmarkDelivered(d.id)}
                                  title="Ghalati theek karein (Undo Delivered)"
                                  style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '4px 8px', fontSize: 11 }}
                                >
                                  Undo
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MARK DELIVERED MODAL ────────────────────────────── */}
      {deliveryModalItem && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 480, maxWidth: '95%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={20} color="#10b981" />
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Mark as Delivered — #{deliveryModalItem.booking_no}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDeliveryModalItem(null)}
                style={{ padding: 4, borderRadius: '50%' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                Customer: {deliveryModalItem.customer_name} ({deliveryModalItem.customer_phone})
              </div>
              <div style={{ color: '#64748b' }}>
                Dresses: {deliveryModalItem.dresses_summary || '—'}
              </div>
            </div>

            {/* Remaining Balance Alert */}
            {Number(deliveryModalItem.remaining || 0) > 0 && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: 12, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <DollarSign size={20} color="#dc2626" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: '#991b1b' }}>
                  <div style={{ fontWeight: 800 }}>
                    Baqi Raqam (Remaining Balance): Rs. {Number(deliveryModalItem.remaining).toLocaleString()}
                  </div>
                  <div>Customer se dress deliver karte waqt baqi raqam wasool karein.</div>
                </div>
              </div>
            )}

            {/* Delivery Date */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                Delivery Date (YYYY-MM-DD)
              </label>
              <input
                type="date"
                className="form-input"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
              />
            </div>

            {/* Delivery Note */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                Delivery Note / Handover Details (Optional)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Delivered to customer's brother with bag"
                value={deliveryNote}
                onChange={e => setDeliveryNote(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeliveryModalItem(null)}
                disabled={submittingDelivery}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmDelivered}
                disabled={submittingDelivery}
                style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
              >
                {submittingDelivery ? 'Saving...' : '✓ Confirm Delivered'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt Modal ───────────────────────────────────── */}
      {receiptBookingId && (
        <ReceiptModal
          bookingId={receiptBookingId}
          isOpen={Boolean(receiptBookingId)}
          onClose={() => setReceiptBookingId(null)}
        />
      )}
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading Deliveries...</div>}>
      <DeliveriesContent />
    </Suspense>
  );
}
