'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  RotateCcw, AlertTriangle, CheckCircle2, Clock, Search, RefreshCw,
  Phone, User, X, Check, DollarSign, ShieldAlert, AlertCircle,
  Camera, Printer, Sparkles,
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';
import { formatDate } from '@/lib/dateUtils';

const FILTERS = [
  { id: 'all',       label: 'Sabhi Returns' },
  { id: 'overdue',   label: '⚠️ Overdue Only' },
  { id: 'due_today', label: 'Aaj Due (Today)' },
  { id: 'pending',   label: 'Pending Return' },
  { id: 'returned',  label: 'Wapas Aa Gaye (Returned)' },
];

function ReturnsContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams?.get('filter') || 'all';

  const [filter, setFilter]     = useState(initialFilter);
  const [search, setSearch]     = useState('');
  const [returns, setReturns]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [userRole, setUserRole] = useState('viewer');

  // Mark Returned Modal State
  const [returnModalItem, setReturnModalItem]   = useState(null);
  const [returnedOn, setReturnedOn]             = useState('');
  const [condition, setCondition]               = useState('OK');
  const [damageNote, setDamageNote]             = useState('');
  const [damagePhoto, setDamagePhoto]           = useState('');

  // Prompts State
  const [refundDeposit, setRefundDeposit]             = useState(false);
  const [depositRefundAmount, setDepositRefundAmount] = useState('');
  const [depositRefundMethod, setDepositRefundMethod] = useState('cash');

  const [receiveRemaining, setReceiveRemaining]       = useState(false);
  const [remainingAmount, setRemainingAmount]         = useState('');
  const [remainingMethod, setRemainingMethod]         = useState('cash');

  const [closeBooking, setCloseBooking]               = useState(false);
  const [closeReason, setCloseReason]                 = useState('');

  const [submittingReturn, setSubmittingReturn]       = useState(false);

  // Receipt Modal
  const [receiptBookingId, setReceiptBookingId]       = useState(null);

  const reloadRef = useRef(null);

  useEffect(() => {
    window.electronAPI?.auth?.session().then(r => {
      if (r?.ok) setUserRole(r.user.role);
    });
  }, []);

  useEffect(() => {
    async function fetchReturns() {
      setLoading(true);
      try {
        const res = await window.electronAPI?.tracking?.listReturns({
          filter,
          search,
        });
        if (res?.ok) {
          setReturns(res.data || []);
        } else {
          setReturns([]);
        }
      } catch (err) {
        console.error('Failed to load returns:', err);
        setReturns([]);
      } finally {
        setLoading(false);
      }
    }
    reloadRef.current = fetchReturns;
    fetchReturns();
  }, [filter, search]);

  // Open Mark Returned Modal with smart default pre-fills
  function openReturnModal(booking) {
    setReturnModalItem(booking);
    setReturnedOn(new Date().toISOString().slice(0, 10));
    setCondition(booking.return_condition || 'OK');
    setDamageNote(booking.return_damage_note || '');
    setDamagePhoto(booking.return_damage_photo || '');

    // Default prompt values
    const dep = Number(booking.security_deposit || 0);
    const rem = Number(booking.remaining || 0);

    setRefundDeposit(dep > 0);
    setDepositRefundAmount(dep > 0 ? String(dep) : '');
    setDepositRefundMethod('cash');

    setReceiveRemaining(rem > 0);
    setRemainingAmount(rem > 0 ? String(rem) : '');
    setRemainingMethod('cash');

    // Auto-offer close if it will be settled
    setCloseBooking(rem === 0 || rem > 0);
    setCloseReason('');
  }

  // Confirm Mark Returned
  async function handleConfirmReturned() {
    if (!returnModalItem) return;
    setSubmittingReturn(true);
    try {
      const res = await window.electronAPI?.tracking?.markReturned({
        bookingId: returnModalItem.id,
        returnedOn,
        condition,
        damageNote: damageNote.trim(),
        damagePhoto: damagePhoto.trim(),
        refundDeposit,
        depositRefundMethod,
        depositRefundAmount: refundDeposit ? Number(depositRefundAmount) : null,
        receiveRemaining,
        remainingMethod,
        remainingAmount: receiveRemaining ? Number(remainingAmount) : null,
        closeBooking,
        closeReason: closeReason.trim(),
      });

      if (res?.ok) {
        setReturnModalItem(null);
        await reloadRef.current?.();
      } else {
        alert(res?.message || 'Return mark nahi ho saka.');
      }
    } catch (err) {
      alert(err.message || 'Return mark karte waqt error aaya.');
    } finally {
      setSubmittingReturn(false);
    }
  }

  // Unmark Returned
  async function handleUnmarkReturned(bookingId) {
    if (userRole === 'viewer') return;
    if (!window.confirm('Kya aap is booking ka return status wapas pending karna chahte hain?')) {
      return;
    }
    try {
      const res = await window.electronAPI?.tracking?.unmarkReturned(bookingId);
      if (res?.ok) {
        await reloadRef.current?.();
      } else {
        alert(res?.message || 'Unmark nahi ho saka.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred');
    }
  }

  const overdueCount = returns.filter(r => r.is_overdue).length;

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Returns Tracker</h1>
          <p className="page-subtitle">Dresses ki wapsi, condition check aur deposits ka hisab</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => reloadRef.current?.()}
            title="Refresh Karein"
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          {overdueCount > 0 && (
            <span className="badge badge-danger" style={{ padding: '6px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={13} /> {overdueCount} Overdue
            </span>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* ── Filters & Search ──────────────────────────────── */}
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
                  background: filter === f.id && f.id === 'overdue' ? '#dc2626' : undefined,
                  borderColor: filter === f.id && f.id === 'overdue' ? '#dc2626' : undefined,
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

        {/* ── Returns Table ─────────────────────────────────── */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
              <div>Returns load ho rahe hain...</div>
            </div>
          ) : returns.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
              <RotateCcw size={48} style={{ opacity: 0.35, marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Koi return record nahi mila
              </div>
              <div style={{ fontSize: 13 }}>
                Selected filter ke mutabiq koi dress return pending nahi hai. Sab clear hai!
              </div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking #</th>
                    <th>Customer</th>
                    <th>Delivered Date</th>
                    <th>Expected Return</th>
                    <th>Overdue Status</th>
                    <th>Condition</th>
                    <th style={{ textAlign: 'right' }}>Deposit / Baqi</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map(r => {
                    const isReturned = Boolean(r.returned_on);
                    const isOverdue  = Boolean(r.is_overdue);

                    return (
                      <tr
                        key={r.id}
                        style={{
                          background: isOverdue ? '#fff5f5' : isReturned ? '#fafafa' : '#ffffff',
                        }}
                      >
                        {/* Booking # */}
                        <td>
                          <Link
                            href={`/bookings/new?id=${r.id}`}
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              color: '#7c3aed',
                              fontSize: 14,
                              textDecoration: 'none',
                            }}
                          >
                            #{r.booking_no}
                          </Link>
                          {r.status && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              {r.status}
                            </div>
                          )}
                        </td>

                        {/* Customer */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                            {r.customer_name || '—'}
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Phone size={11} /> {r.customer_phone || '—'}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                            {r.dresses_summary || '—'}
                          </div>
                        </td>

                        {/* Delivered Date */}
                        <td>
                          {r.delivered_on ? (
                            <span style={{ fontSize: 12.5, color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              ✓ {formatDate(r.delivered_on)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                              Not delivered yet
                            </span>
                          )}
                        </td>

                        {/* Expected Return */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13, whiteSpace: 'nowrap' }}>
                            {formatDate(r.returning_date)}
                          </div>
                          {r.returned_on && (
                            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                              <Check size={11} /> Returned: {formatDate(r.returned_on)}
                            </div>
                          )}
                        </td>

                        {/* Overdue Badge */}
                        <td>
                          {isOverdue ? (
                            <span
                              className="badge badge-danger"
                              style={{
                                padding: '4px 8px',
                                fontWeight: 800,
                                fontSize: 12,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                animation: 'pulse 2s infinite',
                              }}
                            >
                              <AlertTriangle size={12} />
                              {r.days_late} din LATE
                            </span>
                          ) : isReturned ? (
                            <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 600 }}>
                              On Time / Returned
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: 12 }}>
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Condition */}
                        <td>
                          {isReturned ? (
                            <div>
                              <span
                                className={`badge ${
                                  r.return_condition === 'Damaged'
                                    ? 'badge-danger'
                                    : r.return_condition === 'Needs cleaning'
                                    ? 'badge-warning'
                                    : 'badge-success'
                                }`}
                                style={{ fontSize: 11.5 }}
                              >
                                {r.return_condition || 'OK'}
                              </span>
                              {r.return_damage_note && (
                                <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, fontStyle: 'italic' }}>
                                  Note: {r.return_damage_note}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                          )}
                        </td>

                        {/* Deposit / Remaining */}
                        <td style={{ textAlign: 'right' }}>
                          {r.security_deposit > 0 && (
                            <div style={{ fontSize: 11.5, color: '#7c3aed', fontWeight: 700 }}>
                              Dep: Rs. {Number(r.security_deposit).toLocaleString()}
                            </div>
                          )}
                          <div style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: Number(r.remaining || 0) > 0 ? '#dc2626' : '#16a34a',
                          }}>
                            {Number(r.remaining || 0) > 0
                              ? `Baqi: Rs. ${Number(r.remaining).toLocaleString()}`
                              : 'Paid ✓'}
                          </div>
                        </td>

                        {/* Status */}
                        <td>
                          {isReturned ? (
                            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={12} /> Returned
                            </span>
                          ) : isOverdue ? (
                            <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={12} /> Overdue
                            </span>
                          ) : (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={12} /> Awaiting Return
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setReceiptBookingId(r.id)}
                              title="Print Receipt"
                              style={{ padding: '4px 8px' }}
                            >
                              <Printer size={13} />
                            </button>

                            {userRole !== 'viewer' && (
                              !isReturned ? (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => openReturnModal(r)}
                                  style={{
                                    background: isOverdue ? '#dc2626' : '#3b82f6',
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
                                  <RotateCcw size={13} /> Mark Returned
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleUnmarkReturned(r.id)}
                                  title="Ghalati theek karein (Undo Return)"
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

      {/* ── MARK RETURNED MODAL (WITH RETURN FLOW PROMPTS) ─────── */}
      {returnModalItem && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 540, maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RotateCcw size={20} color="#3b82f6" />
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Mark Dress Returned — #{returnModalItem.booking_no}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setReturnModalItem(null)}
                style={{ padding: 4, borderRadius: '50%' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Customer & Dresses Info */}
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#1e293b' }}>
                Customer: {returnModalItem.customer_name} ({returnModalItem.customer_phone})
              </div>
              <div style={{ color: '#64748b', marginTop: 2 }}>
                Dresses: {returnModalItem.dresses_summary || '—'}
              </div>
            </div>

            {/* Return Date */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                Return Date (YYYY-MM-DD)
              </label>
              <input
                type="date"
                className="form-input"
                value={returnedOn}
                onChange={e => setReturnedOn(e.target.value)}
              />
            </div>

            {/* Condition Choice: OK / Needs cleaning / Damaged */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Dress Condition (Halat)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { id: 'OK', label: '✓ Bilkul Theek (OK)', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                  { id: 'Needs cleaning', label: '🧺 Dry-Clean Chahiye', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                  { id: 'Damaged', label: '⚠️ Kharab / Damaged', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                ].map(c => {
                  const isSelected = condition === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCondition(c.id)}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 8,
                        border: `2px solid ${isSelected ? c.color : c.border}`,
                        background: isSelected ? c.bg : '#ffffff',
                        color: isSelected ? c.color : '#475569',
                        fontWeight: isSelected ? 800 : 600,
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Damage / Cleaning Note */}
            {(condition === 'Damaged' || condition === 'Needs cleaning') && (
              <div style={{ marginBottom: 16, background: condition === 'Damaged' ? '#fef2f2' : '#fffbeb', padding: 12, borderRadius: 8, border: `1px solid ${condition === 'Damaged' ? '#fecaca' : '#fde68a'}` }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: condition === 'Damaged' ? '#991b1b' : '#92400e', marginBottom: 5 }}>
                  {condition === 'Damaged' ? 'Kharabi ki Tafseel (Damage Note - Required)' : 'Cleaning Note'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={condition === 'Damaged' ? 'e.g. Dupatta torn from corner, stain on sleeve...' : 'e.g. Mild stain on border, needs urgent dry clean'}
                  value={damageNote}
                  onChange={e => setDamageNote(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {/* ── RETURN FLOW PROMPTS ───────────────────────────── */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                Hisab Kitab Prompts (Return Settling)
              </div>

              {/* Prompt 1: Refund Security Deposit */}
              {Number(returnModalItem.security_deposit || 0) > 0 && (
                <div style={{
                  background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8,
                  padding: 12, marginBottom: 10,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, color: '#6b21a8', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={refundDeposit}
                      onChange={e => setRefundDeposit(e.target.checked)}
                    />
                    Security Deposit Wapas Karein (Refund Deposit)
                  </label>

                  {refundDeposit && (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Refund Amount (PKR)</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ marginTop: 3 }}
                          value={depositRefundAmount}
                          onChange={e => setDepositRefundAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Method</span>
                        <select
                          className="form-input form-select"
                          style={{ marginTop: 3 }}
                          value={depositRefundMethod}
                          onChange={e => setDepositRefundMethod(e.target.value)}
                        >
                          <option value="cash">Cash</option>
                          <option value="bank">Bank Transfer</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt 2: Collect Remaining Balance */}
              {Number(returnModalItem.remaining || 0) > 0 && (
                <div style={{
                  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                  padding: 12, marginBottom: 10,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, color: '#991b1b', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={receiveRemaining}
                      onChange={e => setReceiveRemaining(e.target.checked)}
                    />
                    Baqi Raqam Wasool Karein (Collect Remaining Balance)
                  </label>

                  {receiveRemaining && (
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Collecting Amount (PKR)</span>
                        <input
                          type="number"
                          className="form-input"
                          style={{ marginTop: 3 }}
                          value={remainingAmount}
                          onChange={e => setRemainingAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>Method</span>
                        <select
                          className="form-input form-select"
                          style={{ marginTop: 3 }}
                          value={remainingMethod}
                          onChange={e => setRemainingMethod(e.target.value)}
                        >
                          <option value="cash">Cash</option>
                          <option value="bank">Bank Transfer</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt 3: Offer to Close Booking */}
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                padding: 12,
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, color: '#166534', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={closeBooking}
                    onChange={e => setCloseBooking(e.target.checked)}
                  />
                  Booking ko &quot;Closed&quot; Mark Karein (Settle & Close)
                </label>

                {closeBooking && (
                  <div style={{ fontSize: 11.5, color: '#15803d', marginTop: 6, lineHeight: 1.4 }}>
                    Dresses wapas aane aur tamam baqi raqam wasool hone par booking mukammal band ho jayegi.
                  </div>
                )}

                {closeBooking && userRole === 'owner' && Number(returnModalItem.remaining || 0) > 0 && !receiveRemaining && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11.5, color: '#b91c1c', fontWeight: 700 }}>
                      Owner Override: Force Close Reason (Required agar baqi raqam bachi ho)
                    </span>
                    <input
                      type="text"
                      className="form-input"
                      style={{ marginTop: 3 }}
                      placeholder="e.g. Owner approved discount waiver"
                      value={closeReason}
                      onChange={e => setCloseReason(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReturnModalItem(null)}
                disabled={submittingReturn}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmReturned}
                disabled={submittingReturn}
                style={{ background: '#3b82f6', borderColor: '#3b82f6', fontWeight: 700 }}
              >
                {submittingReturn ? 'Saving...' : '✓ Confirm Return & Settle'}
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

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading Returns...</div>}>
      <ReturnsContent />
    </Suspense>
  );
}
