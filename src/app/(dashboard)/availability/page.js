'use client';

/**
 * src/app/(dashboard)/availability/page.js
 *
 * Phase 6 — Availability screen.
 * Pick a date range → see all dresses with Available / Booked status.
 * Each booked dress shows which bookings clash and the customer name.
 * Click a booking number → navigate to that booking for editing.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, Calendar, CheckCircle, XCircle, AlertTriangle,
  ChevronRight, Package, RefreshCw, Info, Check,
} from 'lucide-react';

// ─── Date input helper (Interactive Calendar Picker) ────────────────────────
function DateInput({ value, onChange, id, label, required = false }) {
  return (
    <div className="form-group" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
      {label && (
        <label htmlFor={id} className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={13} style={{ color: '#7c3aed' }} />
          <span>{label}</span>
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type="date"
          className="form-input"
          value={value || ''}
          required={required}
          onChange={e => onChange(e.target.value)}
          onClick={e => {
            try { e.target.showPicker?.(); } catch {}
          }}
          style={{
            height: 42,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            paddingRight: value && !required ? 36 : undefined,
          }}
        />
        {value && !required && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            title="Date saaf karein"
            style={{
              position: 'absolute',
              right: 32,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: 13,
              padding: 4,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function AvailBadge({ status }) {
  if (status === 'available') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0',
        borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700,
      }}>
        <CheckCircle size={13} style={{ color: '#10b981' }} /> Available
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
      borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700,
    }}>
      <XCircle size={13} style={{ color: '#ef4444' }} /> Booked
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function AvailabilityPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [deliveryDate,  setDeliveryDate]  = useState(today);
  const [returningDate, setReturningDate] = useState('');
  const [nameFilter,    setNameFilter]    = useState('');
  const [showFilter,    setShowFilter]    = useState('all'); // 'all' | 'available' | 'booked'
  const [dresses,       setDresses]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [searched,      setSearched]      = useState(false);
  const [error,         setError]         = useState('');
  const [expandedDress, setExpandedDress] = useState(null);

  const handleSearch = useCallback(async () => {
    if (!deliveryDate) { setError('Delivery date daalna zaroori hai.'); return; }
    setError('');
    setLoading(true);
    setSearched(false);
    try {
      const res = await window.electronAPI?.availability.getDresses({
        deliveryDate,
        returningDate: returningDate || null,
      });
      if (res?.ok) {
        setDresses(res.data || []);
      } else {
        setError(res?.message || 'Data load nahi hua.');
      }
    } catch (e) {
      setError('Koi masla aaya: ' + e.message);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [deliveryDate, returningDate]);

  // Filter by name + code + status
  const filtered = dresses.filter(d => {
    const q = nameFilter.trim().toLowerCase();
    const nameMatch = !q ||
      d.dress_name.toLowerCase().includes(q) ||
      (d.dress_code && String(d.dress_code).toLowerCase().includes(q)) ||
      (d.category && d.category.toLowerCase().includes(q));
    const statusMatch = showFilter === 'all' || d.status === showFilter;
    return nameMatch && statusMatch;
  });

  const availableCount = dresses.filter(d => d.status === 'available').length;
  const bookedCount    = dresses.filter(d => d.status === 'booked').length;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dress Availability</h1>
          <p className="page-subtitle">
            Kisi bhi date range ke liye check karein kaun si dresses available hain aur kaun si booked hain
          </p>
        </div>
      </div>

      <div className="page-body">
        {/* ── Search Panel ─────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <DateInput
              id="avail-delivery"
              label="Delivery Date *"
              value={deliveryDate}
              onChange={setDeliveryDate}
              required
            />
            <DateInput
              id="avail-returning"
              label="Returning Date (optional)"
              value={returningDate}
              onChange={setReturningDate}
            />
            <div style={{ flex: '0 0 auto' }}>
              <button
                className="btn btn-primary"
                onClick={handleSearch}
                disabled={loading || !deliveryDate}
                style={{ height: 42, minWidth: 160, fontWeight: 700 }}
              >
                {loading
                  ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Checking...</>
                  : <><Search size={15} /> Check Availability</>
                }
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: '#fee2e2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              borderRadius: 8,
              padding: '10px 14px',
              marginTop: 14,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <AlertTriangle size={15} /> {error}
            </div>
          )}
        </div>

        {/* ── Results ──────────────────────────────────────── */}
        {searched && (
          <>
            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div className="stat-card">
                <div className="stat-card-label">Available</div>
                <div className="stat-card-value" style={{ color: '#16a34a' }}>{availableCount}</div>
                <div className="stat-card-sub">Book karne ke liye tayyar</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Booked</div>
                <div className="stat-card-value" style={{ color: '#dc2626' }}>{bookedCount}</div>
                <div className="stat-card-sub">In tareekhon mein pehle se booked</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">Total Dresses</div>
                <div className="stat-card-value" style={{ color: '#0f172a' }}>{dresses.length}</div>
                <div className="stat-card-sub">Kul inventory ka record</div>
              </div>
            </div>

            {/* Filter row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Dress name ya code se dhundhein..."
                  value={nameFilter}
                  onChange={e => setNameFilter(e.target.value)}
                  style={{ paddingLeft: 36, height: 38, fontSize: 13 }}
                />
                {nameFilter && (
                  <button
                    onClick={() => setNameFilter('')}
                    style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: `All (${dresses.length})` },
                  { id: 'available', label: `Available (${availableCount})` },
                  { id: 'booked', label: `Booked (${bookedCount})` },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setShowFilter(f.id)}
                    className={`btn btn-sm ${showFilter === f.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      borderRadius: 20,
                      padding: '5px 14px',
                      fontSize: 12.5,
                      fontWeight: showFilter === f.id ? 700 : 500,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dress list */}
            {filtered.length === 0 ? (
              <div className="card" style={{ padding: '50px 20px', textAlign: 'center' }}>
                <Package size={44} style={{ color: '#94a3b8', marginBottom: 12, opacity: 0.5 }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Koi dress nahi mili
                </div>
                <div style={{ color: '#64748b', fontSize: 13 }}>
                  Muntakhib karda filters ke mutabiq koi record mojood nahi hai.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map(dress => (
                  <div
                    key={dress.dress_id}
                    className="card"
                    style={{
                      padding: '16px 20px',
                      borderLeft: `5px solid ${dress.status === 'available' ? '#16a34a' : '#dc2626'}`,
                      cursor: dress.status === 'booked' ? 'pointer' : 'default',
                      transition: 'all .2s ease',
                      background: '#ffffff',
                    }}
                    onClick={() => dress.status === 'booked' && setExpandedDress(
                      expandedDress === dress.dress_id ? null : dress.dress_id
                    )}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      {/* Dress info */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{dress.dress_name}</span>
                          {dress.dress_code && (
                            <span style={{
                              fontFamily: 'monospace',
                              fontSize: 12,
                              fontWeight: 700,
                              color: '#7c3aed',
                              background: '#f5f3ff',
                              padding: '2px 7px',
                              borderRadius: 6,
                              border: '1px solid #ddd6fe',
                            }}>
                              #{dress.dress_code}
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 13, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {dress.category && (
                            <span style={{ fontWeight: 600, color: '#334155' }}>
                              {dress.category}
                            </span>
                          )}
                          {dress.size && (
                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4, fontSize: 11.5, fontWeight: 600 }}>
                              Size: {dress.size}
                            </span>
                          )}
                          {dress.rental_price > 0 && (
                            <span style={{ color: '#059669', fontWeight: 700, fontFamily: 'monospace' }}>
                              Rs. {Number(dress.rental_price).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status badge */}
                      <AvailBadge status={dress.status} />

                      {/* Expand arrow for booked */}
                      {dress.status === 'booked' && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 12, color: '#64748b', fontWeight: 600,
                        }}>
                          <span>{expandedDress === dress.dress_id ? 'Hide Clashes' : 'View Clashes'}</span>
                          <ChevronRight
                            size={18}
                            style={{
                              color: '#64748b',
                              transition: 'transform .2s',
                              transform: expandedDress === dress.dress_id ? 'rotate(90deg)' : 'none',
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Expanded clashes */}
                    {dress.status === 'booked' && expandedDress === dress.dress_id && (
                      <div style={{
                        marginTop: 14, paddingTop: 14,
                        borderTop: '1px solid #f1f5f9',
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          color: '#991b1b', fontSize: 12.5, fontWeight: 700, marginBottom: 10,
                        }}>
                          <Info size={14} />
                          Yeh dress is date range mein mandarja zail booking(s) mein booked hai:
                        </div>
                        {dress.clashes && dress.clashes.map(clash => (
                          <div
                            key={clash.booking_id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 14px', borderRadius: 8,
                              background: '#fef2f2',
                              border: '1px solid #fee2e2',
                              marginBottom: 6, flexWrap: 'wrap', gap: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <Link
                                href={`/bookings/new?id=${clash.booking_id}`}
                                style={{
                                  color: '#7c3aed',
                                  fontWeight: 800,
                                  textDecoration: 'none',
                                  fontSize: 14,
                                  fontFamily: 'monospace',
                                }}
                                title="Booking kholne ke liye click karein"
                              >
                                #{clash.booking_no}
                              </Link>
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                                {clash.customer_name || 'Customer'}
                              </span>
                              {clash.customer_phone && (
                                <span style={{ color: '#64748b', fontSize: 12, fontFamily: 'monospace' }}>
                                  📞 {clash.customer_phone}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ color: '#475569', fontSize: 12, fontWeight: 600 }}>
                                📅 {clash.delivery_date} → {clash.returning_date || 'Open'}
                              </div>
                              <span className="badge badge-warning">
                                {clash.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!searched && !loading && (
          <div className="card" style={{ padding: '60px 20px', textAlign: 'center', marginTop: 10 }}>
            <Calendar size={48} style={{ color: '#7c3aed', opacity: 0.6, marginBottom: 14 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
              Dates select karein
            </div>
            <div style={{ color: '#64748b', fontSize: 13 }}>
              Upar delivery aur returning date dal kar &ldquo;Check Availability&rdquo; dabayein.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
