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
  ChevronRight, Package, RefreshCw, Info,
} from 'lucide-react';

// ─── Date input helper ──────────────────────────────────────────────────────
function DateInput({ value, onChange, id, label }) {
  return (
    <div className="form-group" style={{ flex: 1 }}>
      {label && <label htmlFor={id} className="form-label">{label}</label>}
      <input
        id={id}
        type="date"
        className="form-input"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onClick={e => {
          try {
            if (e.target.showPicker) e.target.showPicker();
          } catch (_) {}
        }}
        style={{ cursor: 'pointer' }}
      />
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function AvailBadge({ status }) {
  if (status === 'available') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'rgba(34,197,94,0.15)', color: '#22c55e',
        borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700,
      }}>
        <CheckCircle size={13} /> Available
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'rgba(239,68,68,0.15)', color: '#ef4444',
      borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700,
    }}>
      <XCircle size={13} /> Booked
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

  // Filter by name + status
  const filtered = dresses.filter(d => {
    const nameMatch = !nameFilter || d.dress_name.toLowerCase().includes(nameFilter.toLowerCase());
    const statusMatch = showFilter === 'all' || d.status === showFilter;
    return nameMatch && statusMatch;
  });

  const availableCount = dresses.filter(d => d.status === 'available').length;
  const bookedCount    = dresses.filter(d => d.status === 'booked').length;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
          Dress Availability
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Kisi bhi date range ke liye check karein kaun si dresses available hain aur kaun si booked hain.
        </p>
      </div>

      {/* Search Panel */}
      <div className="card" style={{ marginBottom: 24, padding: '20px 24px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DateInput
            id="avail-delivery"
            label="Delivery Date *"
            value={deliveryDate}
            onChange={setDeliveryDate}
          />
          <DateInput
            id="avail-returning"
            label="Returning Date (optional)"
            value={returningDate}
            onChange={setReturningDate}
          />
          <div style={{ flex: '0 0 auto' }}>
            <label className="form-label">&nbsp;</label>
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={loading || !deliveryDate}
              style={{ height: 42, minWidth: 140 }}
            >
              {loading
                ? <><RefreshCw size={15} className="spin" /> Checking...</>
                : <><Search size={15} /> Check Availability</>
              }
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}
      </div>

      {/* Results */}
      {searched && (
        <>
          {/* Stats bar */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
              <div className="stat-value" style={{ color: '#22c55e' }}>{availableCount}</div>
              <div className="stat-label">Available</div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
              <div className="stat-value" style={{ color: '#ef4444' }}>{bookedCount}</div>
              <div className="stat-label">Booked</div>
            </div>
            <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
              <div className="stat-value">{dresses.length}</div>
              <div className="stat-label">Total Dresses</div>
            </div>
          </div>

          {/* Filter row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Dress name se dhundhein..."
                value={nameFilter}
                onChange={e => setNameFilter(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
            </div>
            {['all', 'available', 'booked'].map(f => (
              <button
                key={f}
                onClick={() => setShowFilter(f)}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: showFilter === f ? 'var(--accent)' : 'var(--surface)',
                  color: showFilter === f ? '#fff' : 'var(--text-muted)',
                  transition: 'all .2s',
                }}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Dress list */}
          {filtered.length === 0 ? (
            <div className="empty-state">
              <Package size={40} />
              <p>Koi dress nahi mili in filters ke sath.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(dress => (
                <div
                  key={dress.dress_id}
                  className="card"
                  style={{
                    padding: '14px 18px',
                    borderLeft: `4px solid ${dress.status === 'available' ? '#22c55e' : '#ef4444'}`,
                    cursor: dress.status === 'booked' ? 'pointer' : 'default',
                    transition: 'all .2s',
                  }}
                  onClick={() => dress.status === 'booked' && setExpandedDress(
                    expandedDress === dress.dress_id ? null : dress.dress_id
                  )}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    {/* Dress info */}
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>
                        {dress.dress_name}
                        {dress.dress_code && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>
                            #{dress.dress_code}
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
                        {[dress.category, dress.size].filter(Boolean).join(' · ')}
                        {dress.rental_price > 0 && (
                          <> · Rs {dress.rental_price.toLocaleString()}</>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <AvailBadge status={dress.status} />

                    {/* Expand arrow for booked */}
                    {dress.status === 'booked' && (
                      <ChevronRight
                        size={18}
                        style={{
                          color: 'var(--text-muted)',
                          transition: 'transform .2s',
                          transform: expandedDress === dress.dress_id ? 'rotate(90deg)' : 'none',
                        }}
                      />
                    )}
                  </div>

                  {/* Expanded clashes */}
                  {dress.status === 'booked' && expandedDress === dress.dress_id && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
                        <Info size={12} style={{ marginRight: 4 }} />
                        Yeh dress in bookings mein booked hai is date range mein:
                      </p>
                      {dress.clashes.map(clash => (
                        <div
                          key={clash.booking_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '8px 12px', borderRadius: 8,
                            background: 'rgba(239,68,68,0.08)',
                            marginBottom: 6, flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <Link
                              href={`/bookings/new?id=${clash.booking_id}`}
                              style={{ color: '#f59e0b', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}
                            >
                              Booking #{clash.booking_no}
                            </Link>
                            <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 8 }}>
                              {clash.customer_name} · {clash.customer_phone}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {clash.delivery_date} → {clash.returning_date || 'open'}
                          </div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                            background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                          }}>
                            {clash.status}
                          </span>
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
        <div className="empty-state" style={{ marginTop: 60 }}>
          <Calendar size={48} style={{ color: 'var(--accent)', marginBottom: 16 }} />
          <p style={{ fontSize: 16, fontWeight: 600 }}>Dates select karein</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            Upar delivery aur returning date dal kar &ldquo;Check Availability&rdquo; dabayein.
          </p>
        </div>
      )}

      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
