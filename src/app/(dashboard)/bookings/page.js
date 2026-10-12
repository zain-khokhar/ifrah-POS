'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  BookOpen, Plus, Search, X, RefreshCw,
  Edit, Trash2, Eye, Filter, Printer,
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';


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

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [userRole, setUserRole] = useState('viewer');
  const [printBookingId, setPrintBookingId] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const reloadRef = useRef(null);

  useEffect(() => {
    window.electronAPI?.auth.session().then(r => { if (r?.ok) setUserRole(r.user.role); });
  }, []);

  useEffect(() => {
    async function fetchBookings() {
      setLoading(true);
      const res = await window.electronAPI?.bookings.list({ search: search || '', status: status || '' });
      if (res?.ok) setBookings(res.data || []);
      setLoading(false);
    }
    reloadRef.current = fetchBookings;
    fetchBookings();
  }, [search, status]);

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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">
            {loading ? 'Loading…' : `${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isViewer && (
            <Link href="/bookings/new" className="btn btn-primary">
              <Plus size={15} /> New Booking
            </Link>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: 36 }}
              placeholder="Booking ID, naam, phone, CNIC..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input form-select" style={{ width: 140 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="None">None</option>
            <option value="Open">Open</option>
            <option value="Pending">Pending</option>
            <option value="Closed">Closed</option>
          </select>
          {(search || status) && (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
              onClick={() => { setSearch(''); setStatus(''); }}>
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <div>Loading bookings...</div>
            </div>
          ) : bookings.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
              <BookOpen size={44} style={{ marginBottom: 12, opacity: 0.35 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                {search || status ? 'Koi booking nahi mili' : 'Abhi koi booking nahi hai'}
              </div>
              <div style={{ fontSize: 13 }}>
                {search || status ? 'Filters clear karein ya alag search karein.' : 'Pehli booking banayein.'}
              </div>
              {!isViewer && !search && !status && (
                <Link href="/bookings/new" className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>
                  <Plus size={14} /> Pehli Booking Banayein
                </Link>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Booking #</th>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Delivery</th>
                  <th>Return</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Remaining</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => (
                  <tr key={b.id}>
                    <td>
                      <span style={{ fontWeight: 800, color: '#7c3aed', fontFamily: 'monospace', fontSize: 14 }}>
                        #{b.booking_no}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{b.customer_name || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#64748b' }}>{b.customer_phone || '—'}</td>
                    <td>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{b.delivery_date || '—'}</div>
                      {b.delivered_on ? (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                          ✓ Delivered
                        </span>
                      ) : (
                        <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Pending</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{b.returning_date || '—'}</div>
                      {b.returned_on ? (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                          ✓ Returned {b.return_condition ? `(${b.return_condition})` : ''}
                        </span>
                      ) : (b.delivered_on && b.returning_date && b.returning_date < new Date().toISOString().slice(0, 10)) ? (
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                          ⚠️ Overdue
                        </span>
                      ) : (
                        <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Awaiting</span>
                      )}
                    </td>
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
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {b.grand_total > 0 ? `Rs. ${b.grand_total.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: b.remaining > 0 ? '#ef4444' : '#10b981' }}>
                      {b.grand_total > 0 ? `Rs. ${b.remaining.toLocaleString()}` : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          title="Receipt Print / Reprint Karein"
                          onClick={() => {
                            setPrintBookingId(b.id);
                            setShowReceiptModal(true);
                          }}
                        >
                          <Printer size={11} /> Receipt
                        </button>
                        {!isViewer && (
                          <Link href={`/bookings/new?id=${b.id}`} className="btn btn-secondary btn-sm">
                            <Edit size={11} />
                          </Link>
                        )}
                        {isOwner && (
                          <button className="btn btn-secondary btn-sm" style={{ color: '#ef4444' }}
                            onClick={() => handleDelete(b)} disabled={deleting === b.id}>
                            {deleting === b.id ? '...' : <><Trash2 size={11} /> </>}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {bookings.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', alignItems: 'center' }}>
              <span>{bookings.length} booking{bookings.length !== 1 ? 's' : ''}{(search || status) ? ' (filtered)' : ''}</span>
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
