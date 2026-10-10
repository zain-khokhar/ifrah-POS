'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Save, Printer, Plus, Trash2, ChevronDown, X, Check,
  RefreshCw, AlertCircle, User, Calendar, Package, UserPlus,
  CreditCard, Ban, CheckCircle, ShieldAlert,
} from 'lucide-react';
import { formatPakPhone, cnicMask, validateCustomer } from '@/lib/customerValidation';

// ─── Date input (DD-MM-YYYY display, YYYY-MM-DD storage) ─────────────────────
function DateInput({ value, onChange, placeholder, disabled, id }) {
  const [display, setDisplay] = useState(() => {
    if (!value) return '';
    const parts = value.split('-');
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : value;
  });
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    if (value) {
      const [y, m, d] = value.split('-');
      setDisplay(`${d}-${m}-${y}`);
    } else {
      setDisplay('');
    }
  }

  function handleChange(e) {
    const raw = e.target.value;
    setDisplay(raw);
    const m1 = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m1) { onChange(`${m1[3]}-${m1[2]}-${m1[1]}`); return; }
    const m2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) { onChange(raw); return; }
    onChange('');
  }

  return (
    <input
      id={id}
      type="text"
      className="form-input"
      value={display}
      onChange={handleChange}
      placeholder={placeholder || 'DD-MM-YYYY'}
      disabled={disabled}
    />
  );
}

// ─── Learning Combobox for Lists (Cities, Casts, Relations, etc.) ─────────────
function LearningCombobox({ tableName, value, onChange, placeholder, disabled, id }) {
  const [options, setOptions] = useState([]);
  const [query,   setQuery]   = useState('');
  const [open,    setOpen]    = useState(false);
  const [adding,  setAdding]  = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    async function fetchOptions() {
      const res = await window.electronAPI?.lists.get(tableName);
      if (res?.ok) setOptions(res.data || []);
    }
    fetchOptions();
  }, [tableName]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedItem = options.find(o => String(o.id) === String(value));
  const filtered = query
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;
  const showAdd = query.trim() &&
    !options.some(o => o.name.toLowerCase() === query.trim().toLowerCase());

  async function handleAdd() {
    if (!query.trim()) return;
    setAdding(true);
    const res = await window.electronAPI?.lists.add(tableName, query.trim());
    if (res?.ok) {
      const res2 = await window.electronAPI?.lists.get(tableName);
      if (res2?.ok) setOptions(res2.data || []);
      onChange(res.id);
      setQuery('');
      setOpen(false);
    }
    setAdding(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        id={id}
        className="form-input"
        style={{ display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer', gap: 6, padding: '7px 10px' }}
        onClick={() => { if (!disabled) { setOpen(o => !o); setQuery(''); } }}
      >
        <span style={{ flex: 1, color: selectedItem ? '#0f172a' : '#94a3b8', fontSize: 13.5, fontWeight: selectedItem ? 600 : 400 }}>
          {selectedItem?.name || placeholder || 'Select karein ya type karein...'}
        </span>
        {value && !disabled && (
          <X size={12} style={{ color: '#94a3b8', cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onChange(''); setQuery(''); }} />
        )}
        <ChevronDown size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 2, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && showAdd) handleAdd(); if (e.key === 'Escape') setOpen(false); }}
              placeholder="Search karein ya naya likhein..."
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: '#0f172a' }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.map(o => (
              <div
                key={o.id}
                onClick={() => { onChange(o.id); setQuery(''); setOpen(false); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: 13.5,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: String(o.id) === String(value) ? '#f5f3ff' : 'transparent',
                }}
                onMouseEnter={e => e.currentTarget.style.background = String(o.id) === String(value) ? '#f5f3ff' : '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = String(o.id) === String(value) ? '#f5f3ff' : 'transparent'}
              >
                {String(o.id) === String(value) && <Check size={11} color="#7c3aed" />}
                <span style={{ fontWeight: String(o.id) === String(value) ? 700 : 400, color: '#0f172a' }}>{o.name}</span>
              </div>
            ))}
            {showAdd && (
              <div
                onClick={handleAdd}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: 13.5, color: '#7c3aed',
                  fontWeight: 600, borderTop: filtered.length ? '1px solid #f1f5f9' : 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {adding ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
                &quot;{query.trim()}&quot; add karein
              </div>
            )}
            {filtered.length === 0 && !showAdd && (
              <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>Koi result nahi mila</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dress picker (learning combobox from dress catalogue) ────────────────────
function DressPicker({ value, valueName, onSelect, disabled }) {
  const [options, setOptions] = useState([]);
  const [query,   setQuery]   = useState('');
  const [open,    setOpen]    = useState(false);
  const [adding,  setAdding]  = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    async function load() {
      const res = await window.electronAPI?.dresses.list({ activeOnly: true });
      if (res?.ok) setOptions(res.data || []);
    }
    load();
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query
    ? options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()) || o.code.toLowerCase().includes(query.toLowerCase()))
    : options.slice(0, 30);

  const showAdd = query.trim() && !options.some(o => o.name.toLowerCase() === query.trim().toLowerCase());

  async function handleQuickAdd() {
    if (!query.trim()) return;
    setAdding(true);
    const res = await window.electronAPI?.dresses.quickAdd(query.trim());
    if (res?.ok) {
      onSelect({ id: res.id, name: query.trim(), rental_price: 0 });
      const res2 = await window.electronAPI?.dresses.list({ activeOnly: true });
      if (res2?.ok) setOptions(res2.data || []);
    }
    setQuery('');
    setOpen(false);
    setAdding(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="form-input" style={{ display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer', gap: 6, padding: '7px 10px' }}
        onClick={() => { if (!disabled) { setOpen(o => !o); setQuery(''); } }}>
        <span style={{ flex: 1, color: valueName ? '#0f172a' : '#94a3b8', fontSize: 13.5, fontWeight: valueName ? 600 : 400 }}>
          {valueName || 'Dress select karein ya type karein...'}
        </span>
        {valueName && !disabled && <X size={12} style={{ color: '#94a3b8' }} onClick={e => { e.stopPropagation(); onSelect(null); }} />}
        <ChevronDown size={12} style={{ color: '#94a3b8' }} />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', marginTop: 2, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && showAdd) handleQuickAdd(); if (e.key === 'Escape') setOpen(false); }}
              placeholder="Naam ya code se search karein..."
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: '#0f172a' }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.map(d => (
              <div key={d.id}
                onClick={() => { onSelect(d); setQuery(''); setOpen(false); }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8, background: d.id === value ? '#f5f3ff' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = d.id === value ? '#f5f3ff' : '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = d.id === value ? '#f5f3ff' : 'transparent'}>
                {d.id === value && <Check size={11} color="#7c3aed" />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.code} {d.rental_price > 0 ? `· Rs. ${d.rental_price.toLocaleString()}` : ''}</div>
                </div>
              </div>
            ))}
            {showAdd && (
              <div onClick={handleQuickAdd}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13.5, color: '#7c3aed', fontWeight: 600, borderTop: filtered.length ? '1px solid #f1f5f9' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {adding ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
                &quot;{query.trim()}&quot; add karein
              </div>
            )}
            {filtered.length === 0 && !showAdd && (
              <div style={{ padding: 12, color: '#94a3b8', fontSize: 13 }}>Koi dress nahi mili</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Customer Card with Search + Inline New Customer Creation ────────────────
function CustomerCard({ customer, onSelectCustomer, disabled }) {
  const [isCreating, setIsCreating] = useState(false);
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);

  // New Customer Form State
  const [newCust, setNewCust] = useState({
    name: '', phone: '', phone2: '', cnic: '',
    relation_type_id: '', relative_name: '', relative_phone: '', relative_cnic: '',
    city_id: '', cast_id: '', address: '', notes: '',
  });
  const [custSaving, setCustSaving] = useState(false);
  const [custError, setCustError]   = useState('');
  const [custFieldErrors, setCustFieldErrors] = useState({});

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSearch(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      const res = await window.electronAPI?.customers.list({ search: q });
      if (res?.ok) { setResults(res.data || []); setOpen(true); }
      setLoading(false);
    }, 250);
  }

  function startCreate(namePrefill = '') {
    setNewCust({
      name: namePrefill || query || '',
      phone: '', phone2: '', cnic: '',
      relation_type_id: '', relative_name: '', relative_phone: '', relative_cnic: '',
      city_id: '', cast_id: '', address: '', notes: '',
    });
    setCustError('');
    setCustFieldErrors({});
    setOpen(false);
    setIsCreating(true);
  }

  function handleNewCustFieldChange(key, val) {
    let finalVal = val;
    if (key === 'phone' || key === 'phone2' || key === 'relative_phone') {
      finalVal = formatPakPhone(val);
    } else if (key === 'cnic' || key === 'relative_cnic') {
      finalVal = cnicMask(val);
    }

    setNewCust(prev => {
      const updated = { ...prev, [key]: finalVal };
      const { errors } = validateCustomer(updated, { isRequiredPhone: false });
      setCustFieldErrors(errors);
      return updated;
    });
    if (custError) setCustError('');
  }

  async function handleSaveNewCustomer() {
    setCustError('');
    const { isValid, errors } = validateCustomer(newCust, { isRequiredPhone: true });
    if (!isValid) {
      setCustFieldErrors(errors);
      setCustError('Barah-e-karam form ke surkh hisson ko durust karein.');
      return;
    }

    setCustSaving(true);
    try {
      const res = await window.electronAPI?.customers.create(newCust);
      if (!res?.ok) {
        setCustError(res?.message || 'Customer save nahi ho saka.');
        setCustSaving(false);
        return;
      }
      const fullRes = await window.electronAPI?.customers.get(res.id);
      if (fullRes?.ok) {
        onSelectCustomer(fullRes.data);
      } else {
        onSelectCustomer({ id: res.id, name: newCust.name, phone: newCust.phone, cnic: newCust.cnic });
      }
      setIsCreating(false);
      setQuery('');
    } catch (err) {
      setCustError(err.message || 'Error occurred');
    } finally {
      setCustSaving(false);
    }
  }

  return (
    <div style={cardStyle}>
      <div style={cardHdr}>
        <User size={16} color="#7c3aed" />
        <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>Customer Details</span>
        {!disabled && !customer && !isCreating && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => startCreate('')}
            style={{ marginLeft: 'auto', gap: 5 }}
          >
            <UserPlus size={13} /> Naya Customer
          </button>
        )}
      </div>

      <div style={cardBody}>
        {/* State 1: Selected Customer */}
        {customer && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ddd6fe',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>
                  {customer.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{customer.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {customer.phone || 'Phone nahi hai'} {customer.cnic ? `• CNIC: ${customer.cnic}` : ''}
                  </div>
                </div>
              </div>
              {!disabled && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onSelectCustomer(null)}
                  style={{ gap: 4 }}
                >
                  <X size={12} /> Doosra Chunein
                </button>
              )}
            </div>

            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 12.5 }}>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>City</div>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{customer.city || '—'}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Relative</div>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>
                  {customer.relative_name ? `${customer.relative_name} (${customer.customer_relation_type || 'Relative'})` : '—'}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Phone 2</div>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{customer.phone2 || '—'}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Previous Bookings</div>
                <div style={{ fontWeight: 800, color: '#7c3aed' }}>{customer.booking_count ?? 0} bookings</div>
              </div>
            </div>
          </div>
        )}

        {/* State 2: Inline New Customer Creation Form */}
        {!customer && isCreating && (
          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserPlus size={15} /> Naya Customer Banayein
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsCreating(false)}>
                Cancel
              </button>
            </div>

            {custError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 10px', color: '#dc2626', fontSize: 12.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} />
                <span>{custError}</span>
              </div>
            )}

            {/* Row 1: Name, Phone 1, Phone 2, CNIC */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Customer Name *</label>
                <input
                  className="form-input"
                  value={newCust.name}
                  onChange={e => handleNewCustFieldChange('name', e.target.value)}
                  placeholder="Ayesha Khan"
                  autoFocus
                  style={{ borderColor: custFieldErrors.name ? '#ef4444' : undefined }}
                />
                {custFieldErrors.name && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                    {custFieldErrors.name}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Phone 1 (Mobile) *</label>
                <input
                  className="form-input"
                  value={newCust.phone}
                  onChange={e => handleNewCustFieldChange('phone', e.target.value)}
                  placeholder="0300-1234567"
                  maxLength={12}
                  style={{ borderColor: custFieldErrors.phone ? '#ef4444' : undefined }}
                />
                {custFieldErrors.phone && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                    {custFieldErrors.phone}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Phone 2 (optional)</label>
                <input
                  className="form-input"
                  value={newCust.phone2}
                  onChange={e => handleNewCustFieldChange('phone2', e.target.value)}
                  placeholder="03xx-xxxxxxx"
                  maxLength={12}
                  style={{ borderColor: custFieldErrors.phone2 ? '#ef4444' : undefined }}
                />
                {custFieldErrors.phone2 && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                    {custFieldErrors.phone2}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>CNIC (optional)</label>
                <input
                  className="form-input"
                  value={newCust.cnic}
                  onChange={e => handleNewCustFieldChange('cnic', e.target.value)}
                  placeholder="00000-0000000-0"
                  maxLength={15}
                  style={{ borderColor: custFieldErrors.cnic ? '#ef4444' : undefined }}
                />
                {custFieldErrors.cnic && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                    {custFieldErrors.cnic}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Relative Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Rishta (Relation)</label>
                <LearningCombobox
                  tableName="relation_types"
                  value={newCust.relation_type_id}
                  onChange={v => handleNewCustFieldChange('relation_type_id', v)}
                  placeholder="Brother, Father..."
                />
                {custFieldErrors.relation_type_id && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                    {custFieldErrors.relation_type_id}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Relative Name</label>
                <input
                  className="form-input"
                  value={newCust.relative_name}
                  onChange={e => handleNewCustFieldChange('relative_name', e.target.value)}
                  placeholder="Relative name..."
                  style={{ borderColor: custFieldErrors.relative_name ? '#ef4444' : undefined }}
                />
                {custFieldErrors.relative_name && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                    {custFieldErrors.relative_name}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Relative Phone</label>
                <input
                  className="form-input"
                  value={newCust.relative_phone}
                  onChange={e => handleNewCustFieldChange('relative_phone', e.target.value)}
                  placeholder="03xx-xxxxxxx"
                  maxLength={12}
                  style={{ borderColor: custFieldErrors.relative_phone ? '#ef4444' : undefined }}
                />
                {custFieldErrors.relative_phone && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                    {custFieldErrors.relative_phone}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Relative CNIC</label>
                <input
                  className="form-input"
                  value={newCust.relative_cnic}
                  onChange={e => handleNewCustFieldChange('relative_cnic', e.target.value)}
                  placeholder="00000-0000000-0"
                  maxLength={15}
                  style={{ borderColor: custFieldErrors.relative_cnic ? '#ef4444' : undefined }}
                />
                {custFieldErrors.relative_cnic && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                    {custFieldErrors.relative_cnic}
                  </div>
                )}
              </div>
            </div>

            {/* Row 3: City, Cast, Address */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 180px 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>City</label>
                <LearningCombobox tableName="cities" value={newCust.city_id} onChange={v => handleNewCustFieldChange('city_id', v)} placeholder="City..." />
              </div>
              <div>
                <label style={labelStyle}>Cast (Biradari)</label>
                <LearningCombobox tableName="casts" value={newCust.cast_id} onChange={v => handleNewCustFieldChange('cast_id', v)} placeholder="Cast..." />
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <input className="form-input" value={newCust.address} onChange={e => handleNewCustFieldChange('address', e.target.value)} placeholder="Ghar ka pata..." />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsCreating(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveNewCustomer}
                disabled={custSaving || Object.keys(custFieldErrors).length > 0}
              >
                {custSaving ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Check size={13} /> Save &amp; Select Customer</>}
              </button>
            </div>
          </div>
        )}

        {/* State 3: Search Customer */}
        {!customer && !isCreating && (
          <div ref={ref} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  className="form-input"
                  value={query}
                  onChange={handleSearch}
                  onFocus={() => { if (results.length) setOpen(true); }}
                  placeholder="Customer ka naam, phone ya CNIC type karein..."
                  disabled={disabled}
                  style={{ width: '100%' }}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => startCreate('')}
                disabled={disabled}
                style={{ gap: 6, flexShrink: 0 }}
              >
                <Plus size={14} /> Naya Customer
              </button>
            </div>

            {open && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,.15)', marginTop: 4, overflow: 'hidden',
              }}>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {results.map(c => (
                    <div
                      key={c.id}
                      onClick={() => { onSelectCustomer(c); setQuery(''); setOpen(false); setResults([]); }}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>
                        {c.phone || '—'} {c.cnic ? `· CNIC: ${c.cnic}` : ''} {c.city ? `· City: ${c.city}` : ''}
                        <span style={{ marginLeft: 8, color: '#7c3aed', fontWeight: 600 }}>{c.booking_count || 0} bookings</span>
                      </div>
                    </div>
                  ))}

                  {/* Add Customer shortcut */}
                  <div
                    onClick={() => startCreate(query.trim())}
                    style={{
                      padding: '10px 12px', cursor: 'pointer', fontSize: 13.5, color: '#7c3aed',
                      fontWeight: 700, background: '#faf5ff', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f3e8ff'}
                    onMouseLeave={e => e.currentTarget.style.background = '#faf5ff'}
                  >
                    <UserPlus size={14} />
                    {query.trim() ? `+ Naya customer "${query.trim()}" banayein` : '+ Naya customer banayein'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Accessory checkbox ───────────────────────────────────────────────────────
function AccessCheck({ label, checked, onChange, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: disabled ? 'default' : 'pointer', fontSize: 12, color: checked ? '#7c3aed' : '#64748b', fontWeight: checked ? 700 : 400, userSelect: 'none' }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} disabled={disabled}
        style={{ accentColor: '#7c3aed', width: 13, height: 13 }} />
      {label}
    </label>
  );
}

// ─── Empty item factory ───────────────────────────────────────────────────────
function emptyItem() {
  return {
    _key: Math.random().toString(36).slice(2),
    dress_id: null, dress_name_snapshot: '', size: '',
    quantity: 1, rate: '', description: '',
    jewellery: false, clutch_purse: false, hand_bag: false,
    double_dupatta: false, shoes: false,
  };
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 3 };
const cardStyle  = { background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16, overflow: 'hidden' };
const cardHdr    = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 };
const cardBody   = { padding: '16px' };

// ─── Main Booking Form ────────────────────────────────────────────────────────
export default function NewBookingPage() {
  const router = useRouter();

  const [bookingNo, setBookingNo] = useState('...');
  const [userRole,  setUserRole]  = useState('viewer');

  // Booking card
  const [status,       setStatus]       = useState('None');
  const [cityId,       setCityId]       = useState('');
  const [bookingDate,  setBookingDate]  = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [returningDate,setReturningDate]= useState('');
  const [notes,        setNotes]        = useState('');

  // Computed read-only fields
  const bookingMonth    = bookingDate ? bookingDate.slice(0, 7) : '';
  const totalReturnDays = (() => {
    if (!deliveryDate || !returningDate) return '';
    const d = Math.abs(Math.round((new Date(returningDate) - new Date(deliveryDate)) / 86400000));
    return d;
  })();

  // Customer card
  const [customer, setCustomer] = useState(null);

  // Auto-fill booking city from customer if empty
  function handleSelectCustomer(c) {
    setCustomer(c);
    if (c?.city_id && !cityId) {
      setCityId(c.city_id);
    }
  }

  const [items, setItems] = useState([emptyItem()]);
  const [deliveryWarning, setDeliveryWarning] = useState(false);

  // Discount & Security Deposit
  const [discount, setDiscount] = useState('');
  const [securityDeposit, setSecurityDeposit] = useState(0);

  // Edit Mode state
  const [editBookingId, setEditBookingId] = useState(null);
  const [existingPayments, setExistingPayments] = useState([]);
  const [lastEditedBy, setLastEditedBy] = useState('');
  const [lastEditedTime, setLastEditedTime] = useState('');

  // Advance Payment (for New Booking)
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState('cash');
  const [advanceDate,   setAdvanceDate]   = useState(new Date().toISOString().slice(0, 10));
  const [advanceNote,   setAdvanceNote]   = useState('');

  // Add Payment Modal (for Existing Booking)
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [newPayAmount,  setNewPayAmount]  = useState('');
  const [newPayMethod,  setNewPayMethod]  = useState('cash');
  const [newPayKind,    setNewPayKind]    = useState('rental');
  const [newPayDate,    setNewPayDate]    = useState(new Date().toISOString().slice(0, 10));
  const [newPayNote,    setNewPayNote]    = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Void Payment Modal
  const [voidTargetPayment, setVoidTargetPayment] = useState(null);
  const [voidReason,        setVoidReason]        = useState('');
  const [submittingVoid,    setSubmittingVoid]    = useState(false);

  // Status Close Checklist Modal
  const [statusCheckModal,  setStatusCheckModal]  = useState(null);
  const [forceCloseReason,  setForceCloseReason]  = useState('');
  const [submittingForceClose, setSubmittingForceClose] = useState(false);

  // Save state
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);

  // Reload booking and payments
  async function reloadBookingData(id) {
    const res = await window.electronAPI?.bookings.get(id);
    if (res?.ok && res.data) {
      const b = res.data;
      setBookingNo(b.booking_no);
      setStatus(b.status || 'None');
      setCityId(b.city_id || '');
      setBookingDate(b.booking_date || '');
      setDeliveryDate(b.delivery_date || '');
      setReturningDate(b.returning_date || '');
      setNotes(b.notes || '');
      setDiscount(b.discount ? String(b.discount) : '');
      setSecurityDeposit(b.security_deposit || 0);
      setExistingPayments(b.payments || []);
      setLastEditedBy(b.updated_by_name || b.created_by_name || '');
      setLastEditedTime(b.updated_at || b.created_at || '');
    }
  }

  // Load initial data
  useEffect(() => {
    async function init() {
      const session = await window.electronAPI?.auth.session();
      if (session?.ok) { setUserRole(session.user.role); }

      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const idParam = params ? params.get('id') : null;

      if (idParam) {
        setEditBookingId(idParam);
        const res = await window.electronAPI?.bookings.get(idParam);
        if (res?.ok && res.data) {
          const b = res.data;
          setBookingNo(b.booking_no);
          setStatus(b.status || 'None');
          setCityId(b.city_id || '');
          setBookingDate(b.booking_date || '');
          setDeliveryDate(b.delivery_date || '');
          setReturningDate(b.returning_date || '');
          setNotes(b.notes || '');
          setDiscount(b.discount ? String(b.discount) : '');
          setSecurityDeposit(b.security_deposit || 0);
          setCustomer({
            id: b.customer_id,
            name: b.customer_name,
            phone: b.customer_phone,
            phone2: b.customer_phone2,
            cnic: b.customer_cnic,
            address: b.customer_address,
            relative_name: b.relative_name,
            relative_phone: b.relative_phone,
            relative_cnic: b.relative_cnic,
          });
          if (b.items && b.items.length > 0) {
            setItems(b.items.map(it => ({
              _key: String(it.id || Math.random()),
              dress_id: it.dress_id,
              dress_name_snapshot: it.dress_name_snapshot,
              size: it.size || '',
              quantity: it.quantity || 1,
              rate: it.rate || 0,
              description: it.description || '',
              jewellery: Boolean(it.jewellery),
              clutch_purse: Boolean(it.clutch_purse),
              hand_bag: Boolean(it.hand_bag),
              double_dupatta: Boolean(it.double_dupatta),
              shoes: Boolean(it.shoes),
            })));
          }
          setExistingPayments(b.payments || []);
          setLastEditedBy(b.updated_by_name || b.created_by_name || '');
          setLastEditedTime(b.updated_at || b.created_at || '');
        }
      } else {
        const nextNo = await window.electronAPI?.bookings.nextNo();
        if (nextNo?.ok) setBookingNo(nextNo.booking_no);
      }
    }
    init();
  }, []);

  // Totals (live)
  const grandTotal = items.reduce((sum, it) => {
    return sum + (parseInt(it.quantity || 1, 10) * parseInt(it.rate || 0, 10));
  }, 0) - parseInt(discount || 0, 10);
  const grandTotalSafe = Math.max(0, grandTotal);

  const totalPaid = editBookingId
    ? existingPayments.filter(p => p.kind === 'rental' && p.is_void === 0).reduce((s, p) => s + (p.amount || 0), 0)
    : Math.max(0, parseInt(advanceAmount || 0, 10));

  const remainingBalance = Math.max(0, grandTotalSafe - totalPaid);
  const overpaidAmount   = totalPaid > grandTotalSafe ? totalPaid - grandTotalSafe : 0;

  // Item helpers
  function setItem(key, field, val) {
    setItems(prev => prev.map(it => it._key === key ? { ...it, [field]: val } : it));
  }

  function removeItem(key) {
    setItems(prev => prev.length > 1 ? prev.filter(it => it._key !== key) : prev);
  }

  function addItem() {
    if (!deliveryDate) {
      setDeliveryWarning(true);
      const el = document.getElementById('delivery-date-field');
      if (el) el.focus();
      return;
    }
    setDeliveryWarning(false);
    setItems(prev => [...prev, emptyItem()]);
  }

  function selectDress(key, dress) {
    if (!dress) {
      setItem(key, 'dress_id', null);
      setItem(key, 'dress_name_snapshot', '');
      setItem(key, 'rate', '');
      return;
    }
    setItems(prev => prev.map(it => it._key === key ? {
      ...it, dress_id: dress.id, dress_name_snapshot: dress.name,
      rate: dress.rental_price || '',
    } : it));
  }

  const isViewer = userRole === 'viewer';
  const isOwner  = userRole === 'owner';

  // Handle Status change with Closed checklist check
  async function handleStatusSelect(newStatus) {
    if (newStatus === status) return;
    if (newStatus === 'Closed') {
      if (editBookingId) {
        const check = await window.electronAPI?.bookings.canClose(editBookingId);
        if (check?.ok && !check.data?.canClose) {
          setStatusCheckModal(check.data);
          return;
        }
      } else {
        // New booking cannot be closed on creation unless fully completed
        if (!deliveryDate || !returningDate || remainingBalance > 0) {
          setStatusCheckModal({
            canClose: false,
            checklist: {
              delivered: Boolean(deliveryDate),
              returned: Boolean(returningDate),
              fullyPaid: remainingBalance === 0,
            },
            missing: [
              !deliveryDate && 'Dresses deliver nahi hui (Delivered mark hona baqi hai)',
              !returningDate && 'Dresses wapis nahi aayi (Returned mark hona baqi hai)',
              remainingBalance > 0 && `Baqaya raqam Rs. ${remainingBalance.toLocaleString()} rehti hai`,
            ].filter(Boolean),
          });
          return;
        }
      }
    }
    setStatus(newStatus);
  }

  // Handle Adding a payment in edit mode
  async function handleCreatePaymentSubmit() {
    if (submittingPayment) return;
    const amt = parseInt(newPayAmount, 10);
    if (!amt || isNaN(amt) || amt <= 0) {
      alert('Raqam 0 se zyada honi chahiye.');
      return;
    }
    setSubmittingPayment(true);
    try {
      const res = await window.electronAPI?.payments.create({
        booking_id: editBookingId,
        amount: amt,
        payment_method: newPayMethod,
        kind: newPayKind,
        paid_on: newPayDate,
        note: newPayNote,
      });
      if (res?.ok) {
        await reloadBookingData(editBookingId);
        setShowAddPaymentModal(false);
        setNewPayAmount('');
        setNewPayNote('');
      } else {
        alert(res?.message || 'Payment save nahi ho saki.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred.');
    } finally {
      setSubmittingPayment(false);
    }
  }

  // Handle Void Payment (Owner only)
  async function handleConfirmVoid() {
    if (submittingVoid || !voidTargetPayment) return;
    setSubmittingVoid(true);
    try {
      const res = await window.electronAPI?.payments.void(voidTargetPayment.id, voidReason || 'Voided by owner');
      if (res?.ok) {
        await reloadBookingData(editBookingId);
        setVoidTargetPayment(null);
        setVoidReason('');
      } else {
        alert(res?.message || 'Payment void nahi ho saki.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred.');
    } finally {
      setSubmittingVoid(false);
    }
  }

  // Handle Force Close (Owner override)
  async function handleConfirmForceClose() {
    if (submittingForceClose || !editBookingId) return;
    if (!forceCloseReason.trim()) {
      alert('Force close karne ke liye reason likhna zaroori hai.');
      return;
    }
    setSubmittingForceClose(true);
    try {
      const res = await window.electronAPI?.bookings.setStatus(editBookingId, 'Closed', {
        forceClose: true,
        forceReason: forceCloseReason.trim(),
      });
      if (res?.ok) {
        setStatus('Closed');
        setStatusCheckModal(null);
        setForceCloseReason('');
        await reloadBookingData(editBookingId);
      } else {
        alert(res?.message || 'Status update failed.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred.');
    } finally {
      setSubmittingForceClose(false);
    }
  }

  // Draft auto-save to localStorage (only in new booking mode)
  const [hasDraft, setHasDraft] = useState(() => {
    if (typeof window === 'undefined' || editBookingId) return false;
    try {
      const savedDraft = localStorage.getItem('ifrah_booking_draft');
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        return Boolean(parsed && (parsed.customer || parsed.items?.some(it => it.dress_name_snapshot)));
      }
    } catch {}
    return false;
  });

  function restoreDraft() {
    try {
      const savedDraft = localStorage.getItem('ifrah_booking_draft');
      if (savedDraft) {
        const p = JSON.parse(savedDraft);
        if (p.status) setStatus(p.status);
        if (p.cityId) setCityId(p.cityId);
        if (p.bookingDate) setBookingDate(p.bookingDate);
        if (p.deliveryDate) setDeliveryDate(p.deliveryDate);
        if (p.returningDate) setReturningDate(p.returningDate);
        if (p.notes) setNotes(p.notes);
        if (p.customer) setCustomer(p.customer);
        if (p.items?.length) setItems(p.items);
        if (p.discount) setDiscount(p.discount);
      }
    } catch {}
    setHasDraft(false);
  }

  function discardDraft() {
    try { localStorage.removeItem('ifrah_booking_draft'); } catch {}
    setHasDraft(false);
  }

  useEffect(() => {
    if (saved || editBookingId) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem('ifrah_booking_draft', JSON.stringify({
          status, cityId, bookingDate, deliveryDate, returningDate,
          notes, customer, items, discount,
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [status, cityId, bookingDate, deliveryDate, returningDate, notes, customer, items, discount, saved, editBookingId]);

  async function handleSave() {
    if (saving || saved || isViewer) return;
    setError('');

    if (!customer?.id) {
      setError('Customer select karna zaroori hai. Pehle customer search karein ya "Naya Customer" par click karein.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_id:    customer?.id || null,
        city_id:        cityId || null,
        status,
        booking_date:   bookingDate || null,
        delivery_date:  deliveryDate || null,
        returning_date: returningDate || null,
        notes:          notes || null,
        discount:       parseInt(discount || 0, 10),
        items: items
          .filter(it => it.dress_name_snapshot.trim() || it.rate)
          .map(it => ({
            dress_id:           it.dress_id,
            dress_name_snapshot: it.dress_name_snapshot || 'Unknown',
            size:               it.size || null,
            quantity:           parseInt(it.quantity || 1, 10),
            rate:               parseInt(it.rate || 0, 10),
            description:        it.description || null,
            jewellery:          it.jewellery ? 1 : 0,
            clutch_purse:       it.clutch_purse ? 1 : 0,
            hand_bag:           it.hand_bag ? 1 : 0,
            double_dupatta:     it.double_dupatta ? 1 : 0,
            shoes:              it.shoes ? 1 : 0,
          })),
      };

      if (editBookingId) {
        const res = await window.electronAPI?.bookings.update(editBookingId, payload);
        if (!res?.ok) { setError(res?.message || 'Update failed.'); return; }
        setSaved(true);
        setTimeout(() => router.push('/bookings'), 800);
      } else {
        payload.advance_amount = parseInt(advanceAmount || 0, 10);
        payload.advance_method = advanceMethod;
        payload.advance_date   = advanceDate;
        payload.advance_note   = advanceNote;

        const res = await window.electronAPI?.bookings.create(payload);
        if (!res?.ok) { setError(res?.message || 'Save failed.'); return; }
        try { localStorage.removeItem('ifrah_booking_draft'); } catch {}
        setSaved(true);
        setTimeout(() => router.push('/bookings'), 800);
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  // Keyboard shortcuts (Ctrl+S, Esc)
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        router.push('/bookings');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title">{editBookingId ? 'Edit Booking' : 'New Booking'}</h1>
            <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 900, color: '#7c3aed' }}>
              #{bookingNo}
            </span>
          </div>
          <p className="page-subtitle" style={{ fontSize: 12.5, color: '#64748b' }}>
            {editBookingId
              ? (lastEditedBy ? `Last edited by ${lastEditedBy} ${lastEditedTime ? `(${new Date(lastEditedTime).toLocaleDateString()})` : ''}` : 'Booking record update karein')
              : 'Nayi dress rental booking register karein'}
          </p>
        </div>
        <Link href="/bookings" className="btn btn-secondary">
          <X size={14} /> Close
        </Link>
      </div>

      <div className="page-body" style={{ maxWidth: 880 }}>
        {/* Unsaved draft notification */}
        {hasDraft && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
            padding: '12px 16px', marginBottom: 16, display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#92400e' }}>
              <AlertCircle size={16} />
              <span>Aapka pehle se ek unsaved draft mojood hai. Kya aap usay restore karna chahte hain?</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={restoreDraft}>
                Restore Draft
              </button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={discardDraft}>
                Discard
              </button>
            </div>
          </div>
        )}

        {/* ── CARD 1: Booking Info ───────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={cardHdr}>
            <Calendar size={16} color="#7c3aed" />
            <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>Booking Details</span>
          </div>
          <div style={cardBody}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {/* Status */}
              <div>
                <label style={labelStyle}>
                  Status
                  <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4, fontWeight: 400 }} title="Closed ke liye delivered, returned aur remaining Rs. 0 hona zaroori hai.">
                    ⓘ
                  </span>
                </label>
                <select
                  className="form-input form-select"
                  value={status}
                  onChange={e => handleStatusSelect(e.target.value)}
                  disabled={isViewer}
                >
                  {['None','Open','Pending','Closed'].map(s =>
                    <option key={s} value={s}>{s}</option>
                  )}
                </select>
              </div>
              {/* City (Learning Combobox) */}
              <div>
                <label style={labelStyle}>City</label>
                <LearningCombobox
                  tableName="cities"
                  value={cityId}
                  onChange={setCityId}
                  placeholder="City select ya type karein..."
                  disabled={isViewer}
                />
              </div>
              {/* Booking Month (read-only) */}
              <div>
                <label style={labelStyle}>Month <span style={{ color: '#94a3b8', fontWeight: 400 }}>(auto)</span></label>
                <input className="form-input" value={bookingMonth} readOnly
                  style={{ background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }} />
              </div>
              {/* Booking date */}
              <div>
                <label style={labelStyle}>Booking Date</label>
                <DateInput value={bookingDate} onChange={setBookingDate} disabled={isViewer} />
              </div>
              {/* Delivery date */}
              <div>
                <label style={labelStyle}>
                  Delivery Date
                  {deliveryWarning && (
                    <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 6 }}>
                      ⚠ Dress add karne se pehle ye bharo
                    </span>
                  )}
                </label>
                <DateInput id="delivery-date-field" value={deliveryDate} onChange={v => { setDeliveryDate(v); if (v) setDeliveryWarning(false); }} disabled={isViewer} />
              </div>
              {/* Returning date */}
              <div>
                <label style={labelStyle}>Returning Date</label>
                <DateInput value={returningDate} onChange={setReturningDate} disabled={isViewer} />
              </div>
              {/* Total returning days (read-only) */}
              <div>
                <label style={labelStyle}>Total Days <span style={{ color: '#94a3b8', fontWeight: 400 }}>(auto)</span></label>
                <input className="form-input" value={totalReturnDays !== '' ? `${totalReturnDays} din` : '—'} readOnly
                  style={{ background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }} />
              </div>
              {/* Notes */}
              <div style={{ gridColumn: '2 / -1' }}>
                <label style={labelStyle}>Notes</label>
                <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Koi khaas baat..." disabled={isViewer} />
              </div>
            </div>
          </div>
        </div>

        {/* ── CARD 2: Customer (Search + Inline New Customer Creation) ── */}
        <CustomerCard
          customer={customer}
          onSelectCustomer={handleSelectCustomer}
          disabled={isViewer}
        />

        {/* ── CARD 3: Dresses ───────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={cardHdr}>
            <Package size={16} color="#7c3aed" />
            <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>Dresses</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{items.length} line{items.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {items.map((it, idx) => (
              <div key={it._key} style={{ borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: 14, paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', minWidth: 20 }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div style={{ flex: 1 }}>
                    <DressPicker
                      value={it.dress_id}
                      valueName={it.dress_name_snapshot}
                      onSelect={(d) => selectDress(it._key, d)}
                      disabled={isViewer}
                    />
                  </div>
                  {items.length > 1 && !isViewer && (
                    <button onClick={() => removeItem(it._key)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '120px 120px 100px 1fr', gap: 10, paddingLeft: 28 }}>
                  <div>
                    <label style={labelStyle}>Size</label>
                    <select className="form-input form-select" style={{ fontSize: 12 }} value={it.size || ''}
                      onChange={e => setItem(it._key, 'size', e.target.value)} disabled={isViewer}>
                      <option value="">—</option>
                      {['XS','S','M','L','XL','XXL','Free Size'].map(s =>
                        <option key={s} value={s}>{s}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Qty</label>
                    <input className="form-input" type="number" min={1} value={it.quantity}
                      onChange={e => setItem(it._key, 'quantity', e.target.value)}
                      style={{ fontSize: 12 }} disabled={isViewer} />
                  </div>
                  <div>
                    <label style={labelStyle}>Rate (Rs.)</label>
                    <input className="form-input" type="number" min={0} value={it.rate}
                      onChange={e => setItem(it._key, 'rate', e.target.value)}
                      style={{ fontSize: 12, fontWeight: 700 }} disabled={isViewer} />
                  </div>
                  <div>
                    <label style={labelStyle}>Line Total</label>
                    <div style={{ padding: '7px 10px', background: '#f8fafc', borderRadius: 8, fontSize: 13, fontWeight: 800, color: '#0f172a', border: '1px solid #e2e8f0' }}>
                      Rs. {(parseInt(it.quantity || 1, 10) * parseInt(it.rate || 0, 10)).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div style={{ paddingLeft: 28, marginTop: 8 }}>
                  <input className="form-input" value={it.description} onChange={e => setItem(it._key, 'description', e.target.value)}
                    placeholder="Condition note / description (optional)..."
                    style={{ fontSize: 12, width: '100%' }} disabled={isViewer} />
                </div>

                {/* Accessories */}
                <div style={{ paddingLeft: 28, marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <AccessCheck label="Jewellery"      checked={it.jewellery}      onChange={v => setItem(it._key, 'jewellery', v)}      disabled={isViewer} />
                  <AccessCheck label="Clutch Purse"   checked={it.clutch_purse}   onChange={v => setItem(it._key, 'clutch_purse', v)}   disabled={isViewer} />
                  <AccessCheck label="Hand Bag"       checked={it.hand_bag}       onChange={v => setItem(it._key, 'hand_bag', v)}       disabled={isViewer} />
                  <AccessCheck label="Double Dupatta" checked={it.double_dupatta} onChange={v => setItem(it._key, 'double_dupatta', v)} disabled={isViewer} />
                  <AccessCheck label="Shoes"          checked={it.shoes}          onChange={v => setItem(it._key, 'shoes', v)}          disabled={isViewer} />
                </div>
              </div>
            ))}

            {!isViewer && (
              <div style={{ paddingTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn btn-secondary" onClick={addItem}>
                  <Plus size={13} /> Aur Dress Add Karein
                </button>
                {deliveryWarning && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#f59e0b', fontSize: 12.5, fontWeight: 600 }}>
                    <AlertCircle size={13} />
                    Pehle Delivery Date bharo, phir dress add karein
                    <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => { document.getElementById('delivery-date-field')?.focus(); }}>
                      Jump to date
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Discount row */}
            <div style={{ marginTop: 14, borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Discount (Rs.)</label>
              <input className="form-input" type="number" min={0} value={discount}
                onChange={e => setDiscount(e.target.value)}
                style={{ width: 120, textAlign: 'right', fontWeight: 700 }} disabled={isViewer || userRole === 'cashier'} />
            </div>
          </div>
        </div>

        {/* ── CARD 4: Payments & Hisab Kitab ────────────────────────── */}
        <div style={cardStyle}>
          <div style={cardHdr}>
            <CreditCard size={16} color="#7c3aed" />
            <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
              Payments &amp; Hisab Kitab
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700 }}>
              {remainingBalance === 0 && grandTotalSafe > 0 ? (
                <span style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={13} /> Fully Paid
                </span>
              ) : remainingBalance > 0 ? (
                <span style={{ color: '#d97706' }}>
                  Remaining: Rs. {remainingBalance.toLocaleString()}
                </span>
              ) : (
                <span style={{ color: '#64748b' }}>Rs. 0</span>
              )}
            </span>
          </div>

          <div style={{ padding: '16px' }}>
            {!editBookingId ? (
              /* New Booking: Advance Payment Form */
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                  Advance Payment (optional)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '150px 150px 150px 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Advance Amount (Rs.)</label>
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      value={advanceAmount}
                      onChange={e => setAdvanceAmount(e.target.value)}
                      placeholder="0"
                      style={{ fontWeight: 700 }}
                      disabled={isViewer}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Payment Method</label>
                    <select
                      className="form-input form-select"
                      value={advanceMethod}
                      onChange={e => setAdvanceMethod(e.target.value)}
                      disabled={isViewer}
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank</option>
                      <option value="wallet">Wallet</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Payment Date</label>
                    <DateInput
                      value={advanceDate}
                      onChange={setAdvanceDate}
                      disabled={isViewer}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Note / Details</label>
                    <input
                      className="form-input"
                      value={advanceNote}
                      onChange={e => setAdvanceNote(e.target.value)}
                      placeholder="e.g. Advance cash received"
                      disabled={isViewer}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                  💡 Pehli payment Advance ke tor par darj hogi aur booking bante hi auto deduct ho jayegi.
                </div>
              </div>
            ) : (
              /* Existing Booking: Payment History Ledger Table + Add Payment */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                    Payment History ({existingPayments.length} records)
                  </div>
                  {!isViewer && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setNewPayAmount(remainingBalance > 0 ? String(remainingBalance) : '');
                        setShowAddPaymentModal(true);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      <Plus size={12} /> Nayi Payment Record Karein
                    </button>
                  )}
                </div>

                {existingPayments.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 8 }}>
                    Abhi koi payment darj nahi hui. Nayi payment add karne ke liye upar button dabayein.
                  </div>
                ) : (
                  <table className="data-table" style={{ fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Kind</th>
                        <th>Received By</th>
                        <th>Note</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                        {isOwner && <th>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {existingPayments.map((p, idx) => {
                        const isVoid = p.is_void === 1;
                        return (
                          <tr key={p.id || idx} style={{ opacity: isVoid ? 0.6 : 1, background: isVoid ? '#fef2f2' : undefined }}>
                            <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>#{idx + 1}</td>
                            <td>{p.paid_on}</td>
                            <td>
                              <span style={{
                                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                background: p.payment_method === 'cash' ? '#dcfce7' : p.payment_method === 'bank' ? '#dbeafe' : '#fef3c7',
                                color: p.payment_method === 'cash' ? '#16a34a' : p.payment_method === 'bank' ? '#1d4ed8' : '#d97706',
                                textTransform: 'capitalize',
                              }}>
                                {p.payment_method}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: p.kind === 'deposit' ? '#7c3aed' : '#475569' }}>
                                {p.kind}
                              </span>
                            </td>
                            <td>{p.received_by_name || 'Staff'}</td>
                            <td style={{ color: '#64748b' }}>{p.note || '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: isVoid ? '#94a3b8' : '#10b981', textDecoration: isVoid ? 'line-through' : 'none' }}>
                              Rs. {Number(p.amount || 0).toLocaleString()}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {isVoid ? (
                                <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: 12, fontSize: 10, fontWeight: 800 }} title={p.void_reason}>
                                  Voided
                                </span>
                              ) : (
                                <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 6px', borderRadius: 12, fontSize: 10, fontWeight: 800 }}>
                                  Active ✓
                                </span>
                              )}
                            </td>
                            {isOwner && (
                              <td>
                                {!isVoid && (
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: 10.5, padding: '2px 6px', color: '#dc2626' }}
                                    onClick={() => { setVoidTargetPayment(p); setVoidReason(''); }}
                                  >
                                    <Ban size={10} /> Void
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}
      </div>

      {/* ── STICKY BOTTOM BAR ──────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 220, right: 0,
        background: 'white', borderTop: '2px solid #e2e8f0',
        padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 20,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)', zIndex: 50,
      }}>
        {/* Totals */}
        <div style={{ display: 'flex', gap: 24, flex: 1, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6 }}>Grand Total</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Rs. {grandTotalSafe.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6 }}>Paid</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>Rs. {totalPaid.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
              Remaining
              {remainingBalance === 0 && grandTotalSafe > 0 && (
                <span style={{ fontSize: 9.5, background: '#dcfce7', color: '#16a34a', padding: '1px 5px', borderRadius: 10, fontWeight: 800 }}>
                  Fully Paid
                </span>
              )}
              {overpaidAmount > 0 && (
                <span style={{ fontSize: 9.5, background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 10, fontWeight: 800 }}>
                  Overpaid (+{overpaidAmount})
                </span>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: remainingBalance > 0 ? '#ef4444' : '#10b981' }}>
              Rs. {remainingBalance.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!isViewer && (
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/bookings" className="btn btn-secondary">
              Cancel
            </Link>
            <button className="btn btn-secondary" onClick={handleSave} disabled={saving}>
              <Printer size={14} /> Save &amp; Print
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || saved}
              style={{ minWidth: 120 }}>
              {saved ? (
                <><Check size={14} /> Saved!</>
              ) : saving ? (
                <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
              ) : (
                <><Save size={14} /> Save (Ctrl+S)</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── STATUS CHECKLIST MODAL (When attempting Closed without meeting criteria) ── */}
      {statusCheckModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: 14, maxWidth: 500, width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldAlert size={20} color="#f59e0b" />
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                Booking Close Karne Ki Sharaait Poori Nahi Hain
              </div>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
                System ke rule ke mutabiq booking sirf tab <strong>Closed</strong> ho sakti hai jab ye teeno sharaait poori hon:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                  background: statusCheckModal.checklist?.delivered ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${statusCheckModal.checklist?.delivered ? '#bbf7d0' : '#fef3c7'}`,
                }}>
                  {statusCheckModal.checklist?.delivered ? <CheckCircle size={16} color="#16a34a" /> : <AlertCircle size={16} color="#d97706" />}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    1. Dresses Delivered Mark Ho Chuki Hon
                  </span>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                  background: statusCheckModal.checklist?.returned ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${statusCheckModal.checklist?.returned ? '#bbf7d0' : '#fef3c7'}`,
                }}>
                  {statusCheckModal.checklist?.returned ? <CheckCircle size={16} color="#16a34a" /> : <AlertCircle size={16} color="#d97706" />}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    2. Dresses Returned Mark Ho Chuki Hon
                  </span>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
                  background: statusCheckModal.checklist?.fullyPaid ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${statusCheckModal.checklist?.fullyPaid ? '#bbf7d0' : '#fecaca'}`,
                }}>
                  {statusCheckModal.checklist?.fullyPaid ? <CheckCircle size={16} color="#16a34a" /> : <AlertCircle size={16} color="#dc2626" />}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    3. Baqaya Balance Rs. 0 (Fully Paid) Ho
                  </span>
                </div>
              </div>

              {/* Owner force close option */}
              {isOwner && editBookingId && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                    Owner Override (Force Close):
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    Khas halat mein owner booking force-close kar sakta hai. Wajah likhna lazmi hai:
                  </div>
                  <input
                    className="form-input"
                    placeholder="Force close karne ki wajah likhein..."
                    value={forceCloseReason}
                    onChange={e => setForceCloseReason(e.target.value)}
                    style={{ fontSize: 12.5 }}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleConfirmForceClose}
                    disabled={submittingForceClose || !forceCloseReason.trim()}
                    style={{ marginTop: 8, width: '100%', color: '#d97706', borderColor: '#fde68a' }}
                  >
                    {submittingForceClose ? 'Updating...' : 'Force Close Booking (Owner Only)'}
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setStatusCheckModal(null)}>
                  Samjh Gaya (Revert Status)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD PAYMENT MODAL (for existing booking) ── */}
      {showAddPaymentModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: 14, maxWidth: 440, width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                Payment Record Karein
              </div>
              <X size={16} style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setShowAddPaymentModal(false)} />
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Raqam (Rs.)</label>
                <input
                  className="form-input"
                  type="number"
                  min={1}
                  value={newPayAmount}
                  onChange={e => setNewPayAmount(e.target.value)}
                  placeholder="Payment amount..."
                  style={{ fontSize: 15, fontWeight: 800 }}
                  autoFocus
                />
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Remaining balance: Rs. {remainingBalance.toLocaleString()}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Payment Method</label>
                  <select
                    className="form-input form-select"
                    value={newPayMethod}
                    onChange={e => setNewPayMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="wallet">Mobile Wallet</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Kind</label>
                  <select
                    className="form-input form-select"
                    value={newPayKind}
                    onChange={e => setNewPayKind(e.target.value)}
                  >
                    <option value="rental">Rental (Rent Payment)</option>
                    <option value="deposit">Deposit (Security)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Payment Date</label>
                <DateInput value={newPayDate} onChange={setNewPayDate} />
              </div>

              <div>
                <label style={labelStyle}>Note (optional)</label>
                <input
                  className="form-input"
                  value={newPayNote}
                  onChange={e => setNewPayNote(e.target.value)}
                  placeholder="e.g. Baqaya balance receive hua"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowAddPaymentModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreatePaymentSubmit}
                  disabled={submittingPayment}
                >
                  {submittingPayment ? 'Saving...' : 'Payment Save Karein'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VOID PAYMENT MODAL (Owner only) ── */}
      {voidTargetPayment && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: 14, maxWidth: 420, width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ban size={18} color="#dc2626" />
              <div style={{ fontWeight: 800, fontSize: 15, color: '#dc2626' }}>
                Payment Void Karein
              </div>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
                Kya aap waqai Payment <strong>#{voidTargetPayment.id}</strong> (Rs. {Number(voidTargetPayment.amount || 0).toLocaleString()}) ko void karna chahte hain?
                Is se remaining balance dubara adjust ho jayega.
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Void Karne Ki Wajah (Required)</label>
                <input
                  className="form-input"
                  placeholder="e.g. Ghalat amount darj hui thi..."
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setVoidTargetPayment(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={handleConfirmVoid}
                  disabled={submittingVoid || !voidReason.trim()}
                  style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700 }}
                >
                  {submittingVoid ? 'Voiding...' : 'Yes, Void Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
