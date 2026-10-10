'use client';

/**
 * src/app/(dashboard)/search/page.js
 *
 * Phase 7 — Global Search & Advanced Filters.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, SlidersHorizontal, X, ChevronLeft, ChevronRight,
  RefreshCw, AlertTriangle,
} from 'lucide-react';

const PAGE_SIZE = 100;

const DATE_FIELD_OPTIONS = [
  { value: 'booking_date',   label: 'Booking Date'  },
  { value: 'delivery_date',  label: 'Delivery Date' },
  { value: 'returning_date', label: 'Return Date'   },
];

function StatusBadge({ status }) {
  const styles = {
    None:    { bg: '#f1f5f9',               color: '#64748b' },
    Open:    { bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6' },
    Pending: { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
    Closed:  { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e' },
  };
  const s = styles[status] || styles.None;
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 20,
      background: s.bg, color: s.color,
    }}>
      {status || 'None'}
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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
          Global Search
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Bookings, customers, dresses — sab kuch ek jagah se dhundhen. Ctrl+K se focus karein.
        </p>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          ref={inputRef}
          type="text"
          className="form-input"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') runSearch(0); }}
          placeholder="Booking #, customer naam, phone, CNIC, dress naam... (Ctrl+K)"
          style={{ paddingLeft: 44, paddingRight: 48, fontSize: 15, height: 48 }}
          autoFocus
        />
        {loading && (
          <RefreshCw size={16} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
        )}
        {!loading && q && (
          <button
            onClick={() => { setQ(''); setResults([]); setSearched(false); setTotal(0); }}
            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filter Toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={() => setShowFilters(f => !f)} style={{ gap: 6, position: 'relative' }}>
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
              {activeFilterCount}
            </span>
          )}
        </button>
        <button className="btn btn-primary" onClick={() => runSearch(0)} disabled={loading} style={{ gap: 6 }}>
          <Search size={14} /> Search
        </button>
        {activeFilterCount > 0 && (
          <button className="btn btn-secondary" onClick={clearFilters} style={{ gap: 6 }}>
            <X size={13} /> Clear
          </button>
        )}
        {searched && (
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>
            {total.toLocaleString()} results
          </span>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>

            <div>
              <label className="form-label">Status</label>
              <select className="form-input form-select" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Sab</option>
                {['None','Open','Pending','Closed'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Month (YYYY-MM)</label>
              <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)} style={{ colorScheme: 'dark' }} />
            </div>

            <div>
              <label className="form-label">Date Field</label>
              <select className="form-input form-select" value={dateField} onChange={e => setDateField(e.target.value)}>
                {DATE_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Date From</label>
              <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ colorScheme: 'dark' }} />
            </div>

            <div>
              <label className="form-label">Date To</label>
              <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ colorScheme: 'dark' }} />
            </div>

            <div>
              <label className="form-label">City</label>
              <select className="form-input form-select" value={cityId} onChange={e => setCityId(e.target.value)}>
                <option value="">Sab Cities</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="form-label">Cast (Biradari)</label>
              <select className="form-input form-select" value={castId} onChange={e => setCastId(e.target.value)}>
                <option value="">Sab Casts</option>
                {casts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Empty state */}
      {searched && results.length === 0 && !loading && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <Search size={40} />
          <p>Koi result nahi mila.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Doosre keywords ya filters try karein.</p>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['#', 'Booking', 'Customer', 'Dresses', 'Dates', 'Amount', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, idx) => (
                  <tr
                    key={row.id}
                    onClick={() => router.push(`/bookings/new?id=${row.id}`)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 11 }}>
                      {page * PAGE_SIZE + idx + 1}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: 14 }}>#{row.booking_no}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{row.booking_date || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, color: '#fff' }}>{row.customer_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {[row.customer_phone, row.city, row.cast].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 220 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.dresses_summary || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {row.delivery_date
                          ? <>{row.delivery_date}<br /><span style={{ fontSize: 10 }}>{row.returning_date ? '→ ' + row.returning_date : '→ open'}</span></>
                          : '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, color: '#fff' }}>Rs {(row.grand_total || 0).toLocaleString()}</div>
                      {row.remaining > 0 && (
                        <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>Baq: Rs {row.remaining.toLocaleString()}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 24 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => runSearch(page - 1)} disabled={page === 0 || loading} style={{ gap: 4 }}>
                <ChevronLeft size={14} /> Pehla
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Page {page + 1} / {totalPages} ({total.toLocaleString()} total)
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => runSearch(page + 1)} disabled={page >= totalPages - 1 || loading} style={{ gap: 4 }}>
                Agla <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Initial State */}
      {!searched && !loading && (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <Search size={48} style={{ color: 'var(--accent)', marginBottom: 16 }} />
          <p style={{ fontSize: 16, fontWeight: 600 }}>Kuch dhundhen</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            Customer ka naam, phone number, booking number, ya dress name type karein.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>Tip: Ctrl+K se search bar focus hoga</p>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
