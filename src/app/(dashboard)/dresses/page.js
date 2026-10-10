'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, X, Check, ChevronDown, RefreshCw,
  Edit, Shirt, Tag, ToggleLeft, ToggleRight, Upload, Image,
} from 'lucide-react';

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

  // Auto-generate code for new dress
  useEffect(() => {
    if (!editDress) {
      window.electronAPI?.dresses.nextCode().then(r => {
        if (r?.ok) setForm(f => ({ ...f, code: r.code }));
      });
    }
  }, [editDress]);

  // Similar name suggestion as user types
  useEffect(() => {
    if (!form.name || editDress) return;
    const t = setTimeout(async () => {
      const res = await window.electronAPI?.dresses.suggestSimilar(form.name);
      if (res?.ok) setSimilar(res.data || []);
    }, 500);
    return () => clearTimeout(t);
  }, [form.name, editDress]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  async function handleSave() {
    setError('');
    if (!form.name.trim()) { setError('Dress name zaruri hai.'); return; }
    setSaving(true);
    try {
      let res;
      if (editDress) {
        res = await window.electronAPI?.dresses.update(editDress.id, form);
      } else {
        res = await window.electronAPI?.dresses.create(form);
      }
      if (res?.ok === false) { setError(res.message || 'Save failed.'); return; }
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
            {editDress ? 'Edit Dress' : 'Add New Dress'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="#64748b" />
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Similar name warning */}
          {similar.length > 0 && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontWeight: 600, color: '#c2410c', fontSize: 12.5, marginBottom: 5 }}>
                💡 Similar dresses already exist:
              </div>
              {similar.map(s => <div key={s.id} style={{ fontSize: 13, color: '#78350f' }}>• {s.name}</div>)}
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 5 }}>Duplicate hai? Warna continue karein.</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Dress Code</label>
              <input className="form-input" value={form.code} onChange={e => set('code', e.target.value)}
                placeholder="D-001" disabled={isViewer} style={{ fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={labelStyle}>Size</label>
              <select className="form-input form-select" value={form.size} onChange={e => set('size', e.target.value)} disabled={isViewer}>
                <option value="">Select size...</option>
                {['XS','S','M','L','XL','XXL','Free Size'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Dress Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Red Bridal Lehenga..." disabled={isViewer} />
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <CategoryCombobox value={form.category_id} onChange={v => set('category_id', v)} disabled={isViewer} />
            </div>
            <div>
              <label style={labelStyle}>
                Rental Rate (Rs.)
                {!isOwner && <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 4 }}>(Owner only)</span>}
              </label>
              <input className="form-input" type="number" min={0} value={form.rental_price}
                onChange={e => set('rental_price', e.target.value)}
                placeholder="0" disabled={isViewer || !isOwner} />
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
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dress Catalogue</h1>
          <p className="page-subtitle">
            {loading ? 'Loading…' : `${active} active, ${inactive} inactive`}
          </p>
        </div>
        {!isViewer && (
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <Plus size={15} /> Add Dress
          </button>
        )}
      </div>

      <div className="page-body">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input className="form-input" style={{ paddingLeft: 36 }}
              placeholder="Dress name, code ya category se search karein..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input form-select" style={{ width: 160 }} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
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

        {/* Table */}
        <div className="card">
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
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Dress Name</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'center' }}>Bookings</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dresses.map(d => (
                  <tr key={d.id} style={{ opacity: d.active ? 1 : 0.6 }}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: '#7c3aed' }}>{d.code}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{d.name}</div>
                      {d.description && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>{d.description}</div>}
                    </td>
                    <td><span className="badge badge-gray">{d.category || '—'}</span></td>
                    <td style={{ fontSize: 13 }}>{d.size || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
                      {d.rental_price > 0 ? `Rs. ${d.rental_price.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-info">{d.booking_count}</span>
                    </td>
                    <td>
                      <span className={`badge ${d.active ? 'badge-success' : 'badge-danger'}`}>
                        {d.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {!isViewer && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setModal(d)}>
                            <Edit size={12} /> Edit
                          </button>
                        )}
                        {isOwner && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: d.active ? '#ef4444' : '#10b981' }}
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
          )}
          {dresses.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
              {active} active · {inactive} inactive
              {(search || categoryId || activeOnly) && ' (filtered)'}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <DressModal
          editDress={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => reloadRef.current && reloadRef.current()}
          userRole={userRole}
        />
      )}
    </div>
  );
}
