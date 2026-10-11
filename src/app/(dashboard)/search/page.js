'use client';

/**
 * src/app/(dashboard)/search/page.js
 *
 * Phase 7 — Global Search & Advanced Filters.
 * Enhanced with modern design system, high-contrast typography, and spacious layout.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, SlidersHorizontal, X, ChevronLeft, ChevronRight,
  RefreshCw, AlertTriangle, Printer, Sparkles, Calendar, MapPin
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';

const PAGE_SIZE = 100;

const DATE_FIELD_OPTIONS = [
  { value: 'booking_date',   label: 'Booking Date'  },
  { value: 'delivery_date',  label: 'Delivery Date' },
  { value: 'returning_date', label: 'Return Date'   },
];

function StatusBadge({ status }) {
  const map = {
    None:    { cls: 'badge-gray',    label: 'None' },
    Open:    { cls: 'badge-info',    label: 'Open' },
    Pending: { cls: 'badge-warning', label: 'Pending' },
    Closed:  { cls: 'badge-success', label: 'Closed' },
  };
  const s = map[status] || map.None;
  return (
    <span className={`badge ${s.cls}`} style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px' }}>
      {s.label}
    </span>
  );
}

export default function SearchPage() {
  const router = useRouter();

  const [q,           setQ]           = useState('');
  const [status,      setStatus]      = useState('');
  const [month,       setMonth]       = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [dateField,   setDateField]   = useState('booking_date');
  const [cityId,      setCityId]      = useState('');
  const [castId,      setCastId]      = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [cities, setCities] = useState([]);
  const [casts,  setCasts]  = useState([]);

  const [results,  setResults]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState('');
  const [printBookingId, setPrintBookingId] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const inputRef    = useRef(null);
  const searchTimer = useRef(null);

  // Load dropdown lists
  useEffect(() => {
    async function loadLists() {
      const [c, ca] = await Promise.all([
        window.electronAPI?.lists.get('cities'),
        window.electronAPI?.lists.get('casts'),
      ]);
      if (c?.ok)  setCities(c.data  || []);
      if (ca?.ok) setCasts(ca.data  || []);
    }
    loadLists();
  }, []);

  // Ctrl+K shortcut
  useEffect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const runSearch = useCallback(async (overridePage = 0) => {
    setLoading(true);
    setError('');
    try {
      const filters = {
        q: q.trim(), status, month, dateFrom, dateTo, dateField,
        cityId: cityId || null, castId: castId || null,
        limit: PAGE_SIZE, offset: overridePage * PAGE_SIZE,
      };
      const [resData, resCount] = await Promise.all([
        window.electronAPI?.search.query(filters),
        window.electronAPI?.search.count(filters),
      ]);
      if (resData?.ok) { setResults(resData.data || []); setSearched(true); }
      else setError(resData?.message || 'Search nahi ho saka.');
      if (resCount?.ok) setTotal(resCount.total ?? 0);
      setPage(overridePage);
    } catch (e) {
      setError('Koi masla aaya: ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  }, [q, status, month, dateFrom, dateTo, dateField, cityId, castId]);

  // Debounced auto-search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (q.trim().length >= 2 || q.trim() === '') {
      searchTimer.current = setTimeout(() => runSearch(0), 350);
    }
    return () => clearTimeout(searchTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function clearFilters() {
    setStatus(''); setMonth(''); setDateFrom(''); setDateTo('');
    setDateField('booking_date'); setCityId(''); setCastId('');
  }

  const totalPages       = Math.ceil(total / PAGE_SIZE);
  const activeFilterCount = [status, month, dateFrom, dateTo, cityId, castId].filter(Boolean).length;

  return (
    <div>
      {/* ─── Page Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Global Search</h1>
          <p className="page-subtitle">
            Bookings, customers, aur dresses — sab kuch ek jagah se talash karein
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 12,
            color: '#64748b',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '5px 12px',
            borderRadius: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}>
            <kbd style={{
              background: '#e2e8f0',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              color: '#334155'
            }}>Ctrl+K</kbd> Quick Focus
          </span>
        </div>
      </div>

      {/* ─── Page Body ───────────────────────────────────────────── */}
      <div className="page-body" style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* ─── Search Bar Card ─────────────────────────────────────── */}
        <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
          {/* Main Input Row */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <Search
              size={20}
              style={{
                position: 'absolute',
                left: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                pointerEvents: 'none'
              }}
            />
            <input
              ref={inputRef}
              type="text"
              className="form-input"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch(0); }}
              placeholder="Booking #, customer naam, phone, CNIC, dress naam... (Type to search)"
              style={{
                paddingLeft: 48,
                paddingRight: 48,
                fontSize: 15,
                height: 50,
                borderRadius: 10,
                border: '1.5px solid #cbd5e1',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
              autoFocus
            />
            {loading && (
              <RefreshCw
                size={18}
                style={{
                  position: 'absolute',
                  right: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--accent)',
                  animation: 'spin 1s linear infinite'
                }}
              />
            )}
            {!loading && q && (
              <button
                onClick={() => { setQ(''); setResults([]); setSearched(false); setTotal(0); }}
                style={{
                  position: 'absolute',
                  right: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: 0
                }}
                title="Clear text"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Buttons & Summary Row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowFilters(f => !f)}
              style={{ gap: 7, height: 38 }}
            >
              <SlidersHorizontal size={15} />
              Advanced Filters
              {activeFilterCount > 0 && (
                <span style={{
                  background: showFilters ? '#ffffff' : 'var(--accent)',
                  color: showFilters ? 'var(--accent)' : '#ffffff',
                  borderRadius: 12,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontWeight: 800,
                  marginLeft: 3
                }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => runSearch(0)}
              disabled={loading}
              style={{ gap: 6, height: 38 }}
            >
              <Search size={15} /> Search Karein
            </button>

            {activeFilterCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearFilters}
                style={{ gap: 5, height: 38 }}
              >
                <X size={14} /> Filters Reset
              </button>
            )}

            {searched && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#475569',
                  background: '#f8fafc',
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0'
                }}>
                  Total <strong style={{ color: '#0f172a' }}>{total.toLocaleString()}</strong> results
                </span>
              </div>
            )}
          </div>

          {/* ── Collapsible Filters ── */}
          {showFilters && (
            <div style={{
              marginTop: 18,
              paddingTop: 18,
              borderTop: '1px solid #e2e8f0',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 14
            }}>
              <div>
                <label className="form-label" style={{ color: '#475569', fontWeight: 600, marginBottom: 5 }}>Status</label>
                <select className="form-input form-select" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="">Sab Status</option>
                  {['None','Open','Pending','Closed'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ color: '#475569', fontWeight: 600, marginBottom: 5 }}>Month</label>
                <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)} />
              </div>

              <div>
                <label className="form-label" style={{ color: '#475569', fontWeight: 600, marginBottom: 5 }}>Date Field</label>
                <select className="form-input form-select" value={dateField} onChange={e => setDateField(e.target.value)}>
                  {DATE_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ color: '#475569', fontWeight: 600, marginBottom: 5 }}>Date From</label>
                <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>

              <div>
                <label className="form-label" style={{ color: '#475569', fontWeight: 600, marginBottom: 5 }}>Date To</label>
                <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>

              <div>
                <label className="form-label" style={{ color: '#475569', fontWeight: 600, marginBottom: 5 }}>City</label>
                <select className="form-input form-select" value={cityId} onChange={e => setCityId(e.target.value)}>
                  <option value="">Sab Cities</option>
                  {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ color: '#475569', fontWeight: 600, marginBottom: 5 }}>Cast (Biradari)</label>
                <select className="form-input form-select" value={castId} onChange={e => setCastId(e.target.value)}>
                  <option value="">Sab Casts</option>
                  {casts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── Error Message ── */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {/* ── Empty State After Search ── */}
        {searched && results.length === 0 && !loading && (
          <div className="card" style={{ padding: '60px 24px', textAlign: 'center', marginTop: 10 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', marginBottom: 14
            }}>
              <Search size={28} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
              Koi record nahi mila
            </h3>
            <p style={{ color: '#64748b', fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
              Aap ke diye gaye keywords ya filters ke mutabiq koi data mojood nahi hai. Dusra naam, phone number ya filters check karein.
            </p>
          </div>
        )}

        {/* ── Results Table ── */}
        {results.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>#</th>
                    <th>Booking</th>
                    <th>Customer</th>
                    <th>Dresses</th>
                    <th>Dates</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center', width: 110 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, idx) => (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/bookings/new?id=${row.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Index */}
                      <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                        {page * PAGE_SIZE + idx + 1}
                      </td>

                      {/* Booking # & Date */}
                      <td>
                        <div style={{ fontWeight: 800, color: '#7c3aed', fontSize: 14, letterSpacing: '-0.2px' }}>
                          #{row.booking_no}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} /> {row.booking_date || '—'}
                        </div>
                      </td>

                      {/* Customer Info */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                          {row.customer_name || '—'}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                          {[row.customer_phone, row.city, row.cast].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>

                      {/* Dresses Summary */}
                      <td style={{ maxWidth: 260 }}>
                        <div style={{
                          fontSize: 12.5,
                          color: '#334155',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }} title={row.dresses_summary}>
                          {row.dresses_summary || '—'}
                        </div>
                      </td>

                      {/* Dates */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 12.5, color: '#0f172a', fontWeight: 600 }}>
                          {row.delivery_date || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                          {row.returning_date ? `Wapsi: ${row.returning_date}` : 'Wapsi: Open'}
                        </div>
                      </td>

                      {/* Amount & Remaining */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                          Rs {(row.grand_total || 0).toLocaleString()}
                        </div>
                        {row.remaining > 0 ? (
                          <div style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: '#b45309',
                            background: '#fef3c7',
                            padding: '2px 7px',
                            borderRadius: 6,
                            display: 'inline-block',
                            marginTop: 3
                          }}>
                            Baqi: Rs {row.remaining.toLocaleString()}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#16a34a', marginTop: 2 }}>
                            Paid in Full
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center' }}>
                        <StatusBadge status={row.status} />
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          title="Receipt Print / Reprint Karein"
                          onClick={() => {
                            setPrintBookingId(row.id);
                            setShowReceiptModal(true);
                          }}
                          style={{
                            padding: '5px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            border: '1px solid #cbd5e1'
                          }}
                        >
                          <Printer size={13} /> Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc'
              }}>
                <span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
                  Page <strong>{page + 1}</strong> of <strong>{totalPages}</strong> ({total.toLocaleString()} records)
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => runSearch(page - 1)}
                    disabled={page === 0 || loading}
                    style={{ gap: 4 }}
                  >
                    <ChevronLeft size={14} /> Pichla
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => runSearch(page + 1)}
                    disabled={page >= totalPages - 1 || loading}
                    style={{ gap: 4 }}
                  >
                    Agla <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Initial Empty State ── */}
        {!searched && !loading && (
          <div className="card" style={{ padding: '64px 24px', textAlign: 'center', marginTop: 10 }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#ede9fe',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#7c3aed', marginBottom: 16
            }}>
              <Search size={30} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
              Talash Shuru Karein
            </h3>
            <p style={{ color: '#64748b', fontSize: 13.5, maxWidth: 440, margin: '0 auto 12px' }}>
              Customer ka naam, phone number, CNIC, booking number, ya dress ka naam likhein.
            </p>
            <span style={{
              fontSize: 12,
              color: '#7c3aed',
              background: '#f5f3ff',
              border: '1px solid #ddd6fe',
              padding: '4px 12px',
              borderRadius: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}>
              <Sparkles size={13} /> Tip: Keyboard par <strong>Ctrl + K</strong> dabayein kisi bhi waqt
            </span>
          </div>
        )}

      </div>

      {/* ── Receipt Modal ── */}
      {showReceiptModal && printBookingId && (
        <ReceiptModal
          bookingId={printBookingId}
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            setPrintBookingId(null);
          }}
          onPrintComplete={() => {
            runSearch(page);
          }}
        />
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
