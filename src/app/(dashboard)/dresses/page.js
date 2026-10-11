'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, X, Check, ChevronDown, RefreshCw,
  Edit, Shirt, Tag, ToggleLeft, ToggleRight, Upload, Image,
  History, Calendar, Printer, FileText, Phone, MapPin, Eye, Sparkles
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    None:    { cls: 'badge-gray',    label: 'None' },
    Open:    { cls: 'badge-info',    label: 'Open' },
    Pending: { cls: 'badge-warning', label: 'Pending' },
    Closed:  { cls: 'badge-success', label: 'Closed' },
  };
  const s = map[status] || map.None;
  return (
    <span className={`badge ${s.cls}`} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px' }}>
      {s.label}
    </span>
  );
}

// ─── Learning Combobox (category) ────────────────────────────────────────────
function CategoryCombobox({ value, onChange, disabled }) {
  const [options, setOptions] = useState([]);
  const [query,   setQuery]   = useState('');
  const [open,    setOpen]    = useState(false);
  const [adding,  setAdding]  = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    async function fetchOptions() {
      const res = await window.electronAPI?.lists.get('dress_categories');
      if (res?.ok) setOptions(res.data || []);
    }
    fetchOptions();
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = options.find(o => o.id === value)?.name || '';
  const filtered = query ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase())) : options;
  const showAdd  = query.trim() && !options.some(o => o.name.toLowerCase() === query.trim().toLowerCase());

  async function handleAdd() {
    if (!query.trim()) return;
    setAdding(true);
    const res = await window.electronAPI?.lists.add('dress_categories', query.trim());
    if (res?.ok) {
      const res2 = await window.electronAPI?.lists.get('dress_categories');
      if (res2?.ok) setOptions(res2.data || []);
      onChange(res.id); setQuery(''); setOpen(false);
    }
    setAdding(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="form-input" style={{ display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer', gap: 6, padding: '8px 10px' }}
        onClick={() => { if (!disabled) { setOpen(o => !o); setQuery(''); } }}>
        <span style={{ flex: 1, color: selectedLabel ? '#1e293b' : '#94a3b8', fontSize: 13.5 }}>
          {selectedLabel || 'Category...'}
        </span>
        {value && !disabled && <X size={13} style={{ color: '#94a3b8', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onChange(''); }} />}
        <ChevronDown size={13} style={{ color: '#94a3b8' }} />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 2, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && showAdd) handleAdd(); if (e.key === 'Escape') setOpen(false); }}
              placeholder="Type to search or add..." style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: '#1e293b' }} />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {filtered.map(o => (
              <div key={o.id} onClick={() => { onChange(o.id); setQuery(''); setOpen(false); }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8, background: o.id === value ? '#f5f3ff' : 'transparent', color: o.id === value ? '#7c3aed' : '#1e293b' }}
                onMouseEnter={e => e.currentTarget.style.background = o.id === value ? '#f5f3ff' : '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = o.id === value ? '#f5f3ff' : 'transparent'}>
                {o.id === value && <Check size={12} />} {o.name}
              </div>
            ))}
            {showAdd && (
              <div onClick={handleAdd}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13.5, color: '#7c3aed', fontWeight: 600, borderTop: filtered.length ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {adding ? <RefreshCw size={12} /> : <Plus size={12} />} Add &quot;{query.trim()}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dress Form Modal ─────────────────────────────────────────────────────────
function DressModal({ editDress, onClose, onSaved, userRole }) {
  const [form,     setForm]     = useState(editDress ? {
    code: editDress.code || '', name: editDress.name || '',
    category_id: editDress.category_id || '', size: editDress.size || '',
    rental_price: editDress.rental_price ?? '', description: editDress.description || '',
  } : { code: '', name: '', category_id: '', size: '', rental_price: '', description: '' });
  const [similar,  setSimilar]  = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [codeHint, setCodeHint] = useState('');

  const isOwner  = userRole === 'owner';
  const isViewer = userRole === 'viewer';

  useEffect(() => {
    if (!editDress) {
      window.electronAPI?.dresses.nextCode().then(r => {
        if (r?.ok && r.code) {
          setCodeHint(r.code);
          setForm(f => ({ ...f, code: r.code }));
        }
      });
    }
  }, [editDress]);

  const suggestTimer = useRef(null);
  function handleNameChange(name) {
    set('name', name);
    clearTimeout(suggestTimer.current);
    if (!name || name.trim().length < 2) { setSimilar([]); return; }
    suggestTimer.current = setTimeout(async () => {
      const res = await window.electronAPI?.dresses.suggestSimilar(name.trim());
      if (res?.ok) setSimilar(res.data || []);
    }, 300);
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) { setError('Dress name zaroori hai.'); return; }
    setSaving(true);
    setError('');

    const payload = {
      code: form.code.trim() || codeHint,
      name: form.name.trim(),
      category_id: form.category_id || null,
      size: form.size.trim() || null,
      rental_price: form.rental_price ? parseInt(form.rental_price, 10) : 0,
      description: form.description.trim() || null,
    };

    let res;
    if (editDress) {
      res = await window.electronAPI?.dresses.update(editDress.id, payload);
    } else {
      res = await window.electronAPI?.dresses.create(payload);
    }

    setSaving(false);
    if (res?.ok === false) {
      setError(res.message || 'Save nahi ho saka.');
    } else {
      onSaved();
      onClose();
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shirt size={18} style={{ color: '#7c3aed' }} />
            <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
              {editDress ? `Edit Dress — ${editDress.code}` : 'Naya Dress Add Karein'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Dress Code</label>
              <input className="form-input" value={form.code} onChange={e => set('code', e.target.value)}
                placeholder={codeHint || 'D-001'} disabled={isViewer} style={{ fontFamily: 'monospace', fontWeight: 600 }} />
            </div>

            <div>
              <label style={labelStyle}>Dress Name *</label>
              <input className="form-input" value={form.name} onChange={e => handleNameChange(e.target.value)}
                placeholder="e.g. Red Bridal Lehenga" disabled={isViewer} autoFocus />
            </div>

            {similar.length > 0 && (
              <div style={{ gridColumn: '1/-1', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#92400e' }}>
                <span style={{ fontWeight: 600 }}>Similar dresses milte hain:</span>{' '}
                {similar.map(s => s.name).join(', ')}
              </div>
            )}

            <div>
              <label style={labelStyle}>Category</label>
              <CategoryCombobox value={form.category_id} onChange={v => set('category_id', v)} disabled={isViewer} />
            </div>

            <div>
              <label style={labelStyle}>Size (e.g. M, L, XL, Free)</label>
              <input className="form-input" value={form.size} onChange={e => set('size', e.target.value)}
                placeholder="M / L / XL / Custom" disabled={isViewer} />
            </div>

            <div>
              <label style={labelStyle}>Rental Rate (Rs.)</label>
              <input className="form-input" type="number" min="0" value={form.rental_price}
                onChange={e => set('rental_price', e.target.value)} placeholder="0" disabled={isViewer} />
            </div>

            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Description / Condition Note</label>
              <textarea className="form-input" value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Dress ki koi khaas baat..." rows={2} disabled={isViewer}
                style={{ resize: 'vertical', minHeight: 52 }} />
            </div>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {!isViewer && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editDress ? 'Save Changes' : 'Add Dress'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dress History Modal ──────────────────────────────────────────────────────
function DressHistoryModal({ dress, onClose, onSelectBookingReceipt }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [search, setSearch]   = useState('');

  useEffect(() => {
    if (!dress?.id) return;
    let active = true;
    async function loadHistory() {
      setLoading(true);
      setError('');
      try {
        let historyResult = null;
        try {
          const res = await window.electronAPI?.dresses?.history?.(dress.id, {
            size: sizeFilter === 'all' ? null : sizeFilter
          });
          if (res?.ok && res.data) {
            historyResult = res.data;
          }
        } catch (e) {
          // If main process hasn't reloaded the new IPC handler, use seamless fallback
        }

        if (!historyResult) {
          // Fallback via currently registered IPC handlers (search.query & bookings.get)
          const searchRes = await window.electronAPI?.search?.query({ q: dress.name, limit: 500 });
          let candidateBookings = searchRes?.ok && Array.isArray(searchRes.data) ? searchRes.data : [];

          if (candidateBookings.length === 0) {
            const listRes = await window.electronAPI?.bookings?.list({ search: dress.name, limit: 500 });
            if (listRes?.ok && Array.isArray(listRes.data)) candidateBookings = listRes.data;
          }

          const detailedItems = [];
          const sizesFound = new Set(dress.size ? [dress.size] : []);

          for (const b of candidateBookings) {
            const fullRes = await window.electronAPI?.bookings?.get(b.id);
            const full = fullRes?.ok ? fullRes.data : null;
            const items = full?.items || [];

            for (const it of items) {
              const matchDress = (it.dress_id && it.dress_id === dress.id) ||
                (it.dress_name_snapshot && it.dress_name_snapshot.toLowerCase().trim() === dress.name.toLowerCase().trim());

              if (matchDress) {
                if (it.size) sizesFound.add(it.size);

                if (sizeFilter && sizeFilter !== 'all') {
                  if ((it.size || '').toLowerCase().trim() !== sizeFilter.toLowerCase().trim()) {
                    continue;
                  }
                }

                detailedItems.push({
                  booking_id: b.id,
                  booking_no: b.booking_no,
                  status: b.status,
                  booking_date: b.booking_date,
                  delivery_date: b.delivery_date,
                  returning_date: b.returning_date,
                  grand_total: b.grand_total,
                  customer_name: b.customer_name,
                  customer_phone: b.customer_phone,
                  city: b.city,
                  size: it.size || dress.size,
                  quantity: it.quantity || 1,
                  rate: it.rate || 0,
                  line_total: it.line_total || it.rate || 0,
                  dress_name_snapshot: it.dress_name_snapshot,
                  item_id: it.id,
                });
              }
            }
          }

          detailedItems.sort((a, b) => (b.booking_no || 0) - (a.booking_no || 0));
          historyResult = {
            dress,
            sizesAvailable: Array.from(sizesFound).filter(Boolean),
            bookings: detailedItems,
          };
        }

        if (active) {
          setData(historyResult);
        }
      } catch (err) {
        if (active) setError(err.message || 'Error loading history');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadHistory();
    return () => { active = false; };
  }, [dress?.id, sizeFilter]);

  const rawBookings = data?.bookings || [];
  const bookings = search.trim()
    ? rawBookings.filter(b =>
        String(b.booking_no).includes(search.trim()) ||
        (b.customer_name && b.customer_name.toLowerCase().includes(search.toLowerCase())) ||
        (b.customer_phone && b.customer_phone.includes(search)) ||
        (b.city && b.city.toLowerCase().includes(search.toLowerCase()))
      )
    : rawBookings;

  const sizes = data?.sizesAvailable || [];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: 'white', borderRadius: 14, width: '100%', maxWidth: 960,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 50px rgba(0,0,0,0.25)', overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          background: '#f8fafc'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'monospace', fontWeight: 800, fontSize: 13,
                color: '#7c3aed', background: '#ede9fe', padding: '3px 8px', borderRadius: 6
              }}>
                {dress.code}
              </span>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {dress.name}
              </h2>
              {dress.category && (
                <span className="badge badge-gray">{dress.category}</span>
              )}
              {dress.size && (
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                  Size: <strong style={{ color: '#0f172a' }}>{dress.size}</strong>
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              Is dress ki tamam bookings aur rental receipts ka record
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: '50%',
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#64748b'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{
          padding: '12px 24px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: '#ffffff'
        }}>
          {/* Size Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginRight: 4 }}>
              Size:
            </span>
            <button
              type="button"
              onClick={() => setSizeFilter('all')}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: sizeFilter === 'all' ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                background: sizeFilter === 'all' ? '#7c3aed' : '#ffffff',
                color: sizeFilter === 'all' ? '#ffffff' : '#475569',
              }}
            >
              All Sizes ({rawBookings.length})
            </button>
            {sizes.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSizeFilter(s)}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: sizeFilter === s ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                  background: sizeFilter === s ? '#7c3aed' : '#ffffff',
                  color: sizeFilter === s ? '#ffffff' : '#475569',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Quick Search in History */}
          <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 200, flex: '0 1 240px' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              className="form-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Booking # ya customer..."
              style={{ paddingLeft: 30, height: 32, fontSize: 12 }}
            />
          </div>
        </div>

        {/* Modal Body / Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <div>Bookings load ho rahi hain...</div>
            </div>
          ) : error ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#ef4444' }}>
              {error}
            </div>
          ) : bookings.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center', color: '#64748b' }}>
              <History size={40} style={{ marginBottom: 12, opacity: 0.35, color: '#7c3aed' }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                Koi booking record nahi mila
              </div>
              <p style={{ fontSize: 13, color: '#64748b', maxWidth: 360, margin: '0 auto' }}>
                {sizeFilter !== 'all'
                  ? `Is size (${sizeFilter}) ke liye abhi koi booking nahi hui.`
                  : 'Is dress ki abhi tak koi booking darj nahi ki gayi.'}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Booking #</th>
                  <th>Customer</th>
                  <th>Dates</th>
                  <th style={{ textAlign: 'center' }}>Size</th>
                  <th style={{ textAlign: 'right' }}>Rate / Total</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center', width: 130 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => (
                  <tr
                    key={b.item_id || b.booking_id}
                    onClick={() => onSelectBookingReceipt(b.booking_id)}
                    style={{ cursor: 'pointer' }}
                    title="Click karein receipt dekhne ke liye"
                  >
                    {/* Booking No */}
                    <td>
                      <div style={{ fontWeight: 800, color: '#7c3aed', fontSize: 14 }}>
                        #{b.booking_no}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                        {b.booking_date || '—'}
                      </div>
                    </td>

                    {/* Customer */}
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                        {b.customer_name || 'Walk-in Customer'}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                        {[b.customer_phone, b.city].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>

                    {/* Dates */}
                    <td>
                      <div style={{ fontSize: 12.5, color: '#0f172a', fontWeight: 600 }}>
                        {b.delivery_date || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        {b.returning_date ? `Wapsi: ${b.returning_date}` : 'Wapsi: Open'}
                      </div>
                    </td>

                    {/* Size */}
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-gray" style={{ fontWeight: 700 }}>
                        {b.size || dress.size || '—'}
                      </span>
                    </td>

                    {/* Rate */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                        Rs. {(b.rate || b.line_total || 0).toLocaleString()}
                      </div>
                      {b.quantity > 1 && (
                        <div style={{ fontSize: 10.5, color: '#64748b' }}>
                          Qty: {b.quantity}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge status={b.status} />
                    </td>

                    {/* Receipt Action Button */}
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSelectBookingReceipt(b.booking_id)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '4px 10px',
                          color: '#7c3aed',
                          borderColor: '#ddd6fe',
                          background: '#f5f3ff'
                        }}
                        title="Is booking ki receipt print / view karein"
                      >
                        <Printer size={13} /> Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '12px 24px', borderTop: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f8fafc'
        }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Showing <strong>{bookings.length}</strong> booking{bookings.length !== 1 ? 's' : ''}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Band Karein
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 };

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DressesPage() {
  const [dresses,    setDresses]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [categories, setCategories] = useState([]);
  const [modal,      setModal]      = useState(null);
  const [userRole,   setUserRole]   = useState('viewer');
  const [togglingId, setTogglingId] = useState(null);

  // History & Receipt Modal state
  const [historyDress, setHistoryDress] = useState(null);
  const [printBookingId, setPrintBookingId] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  useEffect(() => {
    window.electronAPI?.auth.session().then(r => { if (r?.ok) setUserRole(r.user.role); });
    window.electronAPI?.lists.get('dress_categories').then(r => { if (r?.ok) setCategories(r.data || []); });
  }, []);

  const reloadRef = useRef(null);

  useEffect(() => {
    async function fetchDresses() {
      setLoading(true);
      const res = await window.electronAPI?.dresses.list({
        search, categoryId: categoryId || null, activeOnly,
      });
      if (res?.ok) setDresses(res.data || []);
      setLoading(false);
    }
    reloadRef.current = fetchDresses;
    fetchDresses();
  }, [search, categoryId, activeOnly]);

  async function toggleActive(dress) {
    setTogglingId(dress.id);
    await window.electronAPI?.dresses.setActive(dress.id, !dress.active);
    if (reloadRef.current) reloadRef.current();
    setTogglingId(null);
  }

  const isOwner  = userRole === 'owner';
  const isViewer = userRole === 'viewer';
  const active   = dresses.filter(d => d.active).length;
  const inactive = dresses.filter(d => !d.active).length;

  return (
    <div style={{ width: '100%' }}>
      {/* ─── Page Header (Full Width) ──────────────────────────────── */}
      <div className="page-header" style={{ width: '100%' }}>
        <div>
          <h1 className="page-title">Dress Catalogue</h1>
          <p className="page-subtitle">
            {loading ? 'Loading…' : `${active} active, ${inactive} inactive dresses mojood hain`}
          </p>
        </div>
        {!isViewer && (
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <Plus size={15} /> Add Dress
          </button>
        )}
      </div>

      {/* ─── Page Body (Full Width) ────────────────────────────────── */}
      <div className="page-body" style={{ width: '100%', maxWidth: '100%' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: 36 }}
              placeholder="Dress name, code ya category se search karein..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input form-select" style={{ width: 170 }} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13.5, color: '#64748b', whiteSpace: 'nowrap', fontWeight: 500 }}>
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#7c3aed' }} />
            Active only
          </label>
          {(search || categoryId || activeOnly) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setCategoryId(''); setActiveOnly(false); }}>
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* Table Card (Full Width) */}
        <div className="card" style={{ width: '100%', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <div>Loading dresses...</div>
            </div>
          ) : dresses.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <Shirt size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                {search || categoryId || activeOnly ? 'Koi dress nahi mila' : 'Abhi koi dress nahi hai'}
              </div>
              <div style={{ fontSize: 13 }}>
                {search || categoryId || activeOnly ? 'Filters clear karein ya alag naam se search karein.' : 'Pehla dress add karein.'}
              </div>
              {!isViewer && !search && !categoryId && !activeOnly && (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setModal('new')}>
                  <Plus size={14} /> Add First Dress
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Code</th>
                    <th>Dress Name</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                    <th style={{ textAlign: 'center' }}>Bookings</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center', width: 220 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dresses.map(d => (
                    <tr
                      key={d.id}
                      style={{ opacity: d.active ? 1 : 0.65, cursor: 'pointer' }}
                      onClick={() => setHistoryDress(d)}
                      title="Is dress ki booking history dekhne ke liye click karein"
                    >
                      {/* Code */}
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: '#7c3aed' }}>
                          {d.code}
                        </span>
                      </td>

                      {/* Name */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                          {d.name}
                        </div>
                        {d.description && (
                          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                            {d.description}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td>
                        <span className="badge badge-gray">{d.category || '—'}</span>
                      </td>

                      {/* Size */}
                      <td>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                          {d.size || '—'}
                        </span>
                      </td>

                      {/* Rate */}
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 13.5, color: '#0f172a' }}>
                        {d.rental_price > 0 ? `Rs. ${d.rental_price.toLocaleString()}` : '—'}
                      </td>

                      {/* Bookings Count (Clickable) */}
                      <td style={{ textAlign: 'center' }} onClick={e => { e.stopPropagation(); setHistoryDress(d); }}>
                        <span
                          className="badge badge-info"
                          style={{
                            cursor: 'pointer',
                            fontWeight: 800,
                            padding: '3px 10px',
                            boxShadow: '0 1px 2px rgba(59,130,246,0.1)'
                          }}
                          title="Click to view history"
                        >
                          {d.booking_count}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`badge ${d.active ? 'badge-success' : 'badge-danger'}`}>
                          {d.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {/* Booked History Button */}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{
                              color: '#7c3aed',
                              borderColor: '#ddd6fe',
                              background: '#f5f3ff',
                              fontWeight: 600,
                              fontSize: 12
                            }}
                            onClick={() => setHistoryDress(d)}
                            title="Is dress ki booking history dekhein"
                          >
                            <History size={13} /> History
                          </button>

                          {/* Edit Button */}
                          {!isViewer && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setModal(d)}
                              style={{ fontSize: 12 }}
                            >
                              <Edit size={12} /> Edit
                            </button>
                          )}

                          {/* Activate / Deactivate Button */}
                          {isOwner && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ color: d.active ? '#ef4444' : '#10b981', fontSize: 12 }}
                              onClick={() => toggleActive(d)}
                              disabled={togglingId === d.id}
                            >
                              {togglingId === d.id ? '...' : d.active ? (
                                <><ToggleLeft size={12} /> Deactivate</>
                              ) : (
                                <><ToggleRight size={12} /> Activate</>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {dresses.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9', fontSize: 12.5, color: '#64748b', background: '#f8fafc' }}>
              Showing <strong>{dresses.length}</strong> dresses · {active} active · {inactive} inactive
              {(search || categoryId || activeOnly) && ' (filtered)'}
            </div>
          )}
        </div>
      </div>

      {/* ─── Dress Form Modal ──────────────────────────────────────── */}
      {modal && (
        <DressModal
          editDress={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => reloadRef.current && reloadRef.current()}
          userRole={userRole}
        />
      )}

      {/* ─── Dress Booking History Modal ────────────────────────────── */}
      {historyDress && (
        <DressHistoryModal
          dress={historyDress}
          onClose={() => setHistoryDress(null)}
          onSelectBookingReceipt={(bookingId) => {
            setPrintBookingId(bookingId);
            setShowReceiptModal(true);
          }}
        />
      )}

      {/* ─── Receipt Modal ─────────────────────────────────────────── */}
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
