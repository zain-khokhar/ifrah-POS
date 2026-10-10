'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Users, X, ChevronDown, Check,
  Phone, CreditCard, MapPin, User, Edit, Trash2, Eye,
  RefreshCw, AlertCircle,
} from 'lucide-react';
import { formatPakPhone, cnicMask, validateCustomer } from '@/lib/customerValidation';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    name: '', phone: '', phone2: '', cnic: '',
    relation_type_id: '', relative_name: '', relative_phone: '', relative_cnic: '',
    city_id: '', cast_id: '', address: '', notes: '',
  };
}

// ─── Learning Combobox ───────────────────────────────────────────────────────
function LearningCombobox({ tableName, value, onChange, placeholder, disabled }) {
  const [options, setOptions]     = useState([]);
  const [query,   setQuery]       = useState('');
  const [open,    setOpen]        = useState(false);
  const [adding,  setAdding]      = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    async function fetchOptions() {
      const res = await window.electronAPI?.lists.get(tableName);
      if (res?.ok) setOptions(res.data || []);
    }
    fetchOptions();
  }, [tableName]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = options.find(o => o.id === value)?.name || '';
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
        className="form-input"
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 6, padding: '8px 10px' }}
        onClick={() => { if (!disabled) { setOpen(o => !o); setQuery(''); } }}
      >
        <span style={{ flex: 1, color: selectedLabel ? '#1e293b' : '#94a3b8', fontSize: 13.5 }}>
          {selectedLabel || placeholder}
        </span>
        {value && !disabled && (
          <X size={13} style={{ color: '#94a3b8', cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onChange(''); setQuery(''); }} />
        )}
        <ChevronDown size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
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
              placeholder="Type to search or add..."
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, background: 'transparent', color: '#1e293b' }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {filtered.map(o => (
              <div key={o.id}
                onClick={() => { onChange(o.id); setQuery(''); setOpen(false); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: 13.5,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: o.id === value ? '#f5f3ff' : 'transparent',
                  color: o.id === value ? '#7c3aed' : '#1e293b',
                }}
                onMouseEnter={e => e.currentTarget.style.background = o.id === value ? '#f5f3ff' : '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = o.id === value ? '#f5f3ff' : 'transparent'}
              >
                {o.id === value && <Check size={12} />}
                {o.name}
              </div>
            ))}
            {showAdd && (
              <div
                onClick={handleAdd}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: 13.5,
                  color: '#7c3aed', fontWeight: 600,
                  borderTop: filtered.length ? '1px solid #f1f5f9' : 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'transparent',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {adding ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
                Add &quot;{query.trim()}&quot;
              </div>
            )}
            {filtered.length === 0 && !showAdd && (
              <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 13 }}>No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Customer Form Modal ─────────────────────────────────────────────────────
function CustomerModal({ editCustomer, onClose, onSaved, userRole }) {
  const [form, setForm] = useState(editCustomer ? {
    name: editCustomer.name || '', phone: editCustomer.phone || '',
    phone2: editCustomer.phone2 || '', cnic: editCustomer.cnic || '',
    relation_type_id: editCustomer.relation_type_id || '',
    relative_name: editCustomer.relative_name || '',
    relative_phone: editCustomer.relative_phone || '',
    relative_cnic: editCustomer.relative_cnic || '',
    city_id: editCustomer.city_id || '',
    cast_id: editCustomer.cast_id || '',
    address: editCustomer.address || '', notes: editCustomer.notes || '',
  } : emptyForm());
  const [dupWarning,   setDupWarning]   = useState(null);
  const [dupChecked,   setDupChecked]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [fieldErrors,  setFieldErrors]  = useState({});

  const handleFieldChange = (key, val) => {
    let finalVal = val;
    if (key === 'phone' || key === 'phone2' || key === 'relative_phone') {
      finalVal = formatPakPhone(val);
    } else if (key === 'cnic' || key === 'relative_cnic') {
      finalVal = cnicMask(val);
    }

    setForm(prev => {
      const updated = { ...prev, [key]: finalVal };
      const { errors } = validateCustomer(updated, { isRequiredPhone: false });
      setFieldErrors(errors);
      return updated;
    });
    if (error) setError('');
  };

  async function checkDuplicate() {
    if (!editCustomer && form.name) {
      const res = await window.electronAPI?.customers.findDuplicate(form.name, form.phone);
      if (res?.data) {
        setDupWarning(res.data);
        return true;
      }
    }
    return false;
  }

  async function handleSave(forceCreate = false) {
    setError('');

    // Strict validation
    const { isValid, errors } = validateCustomer(form, { isRequiredPhone: true });
    if (!isValid) {
      setFieldErrors(errors);
      setError('Barah-e-karam form ke surkh (red) hisson ko durust karein.');
      return;
    }

    if (!forceCreate && !dupChecked) {
      const hasDup = await checkDuplicate();
      setDupChecked(true);
      if (hasDup) return;
    }

    setSaving(true);
    try {
      let res;
      if (editCustomer) {
        res = await window.electronAPI?.customers.update(editCustomer.id, form);
        if (res?.ok === false) { setError(res.message || 'Save failed.'); return; }
      } else {
        res = await window.electronAPI?.customers.create(form);
        if (!res?.ok) { setError(res?.message || 'Save failed.'); return; }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  const isViewer = userRole === 'viewer';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 20,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 650,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
            {editCustomer ? 'Edit Customer' : 'Add New Customer'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="#64748b" />
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Duplicate warning */}
          {dupWarning && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: '#c2410c', marginBottom: 6 }}>
                ⚠️ This customer may already exist
              </div>
              <div style={{ fontSize: 13, color: '#78350f', marginBottom: 10 }}>
                <strong>{dupWarning.name}</strong> ({dupWarning.phone}) is already in the system.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setDupWarning(null); onClose(); }}>
                  Use existing customer
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => { setDupWarning(null); handleSave(true); }}>
                  Create anyway
                </button>
              </div>
            </div>
          )}

          {/* Row 1: Customer Info */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Customer Details
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Full Name *</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={e => handleFieldChange('name', e.target.value)}
                  placeholder="Ayesha Khan"
                  disabled={isViewer}
                  style={{ borderColor: fieldErrors.name ? '#ef4444' : undefined }}
                />
                {fieldErrors.name && (
                  <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {fieldErrors.name}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Phone 1 (Mobile) *</label>
                <input
                  className="form-input"
                  value={form.phone}
                  onChange={e => handleFieldChange('phone', e.target.value)}
                  placeholder="0300-1234567"
                  disabled={isViewer}
                  maxLength={12}
                  style={{ borderColor: fieldErrors.phone ? '#ef4444' : undefined }}
                />
                {fieldErrors.phone && (
                  <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {fieldErrors.phone}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Phone 2 (optional)</label>
                <input
                  className="form-input"
                  value={form.phone2}
                  onChange={e => handleFieldChange('phone2', e.target.value)}
                  placeholder="03xx-xxxxxxx"
                  disabled={isViewer}
                  maxLength={12}
                  style={{ borderColor: fieldErrors.phone2 ? '#ef4444' : undefined }}
                />
                {fieldErrors.phone2 && (
                  <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {fieldErrors.phone2}
                  </div>
                )}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>CNIC (optional)</label>
                <input
                  className="form-input"
                  value={form.cnic}
                  onChange={e => handleFieldChange('cnic', e.target.value)}
                  placeholder="00000-0000000-0"
                  disabled={isViewer}
                  maxLength={15}
                  style={{ borderColor: fieldErrors.cnic ? '#ef4444' : undefined }}
                />
                {fieldErrors.cnic && (
                  <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {fieldErrors.cnic}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Relative / Guardian */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Relative / Guardian (Zamani / Hawaala)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Relation</label>
                <LearningCombobox
                  tableName="relation_types"
                  value={form.relation_type_id}
                  onChange={v => handleFieldChange('relation_type_id', v)}
                  placeholder="Brother, Father, Husband..."
                  disabled={isViewer}
                />
                {fieldErrors.relation_type_id && (
                  <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {fieldErrors.relation_type_id}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Relative Name</label>
                <input
                  className="form-input"
                  value={form.relative_name}
                  onChange={e => handleFieldChange('relative_name', e.target.value)}
                  placeholder="Muhammad Usman"
                  disabled={isViewer}
                  style={{ borderColor: fieldErrors.relative_name ? '#ef4444' : undefined }}
                />
                {fieldErrors.relative_name && (
                  <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {fieldErrors.relative_name}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Relative Phone</label>
                <input
                  className="form-input"
                  value={form.relative_phone}
                  onChange={e => handleFieldChange('relative_phone', e.target.value)}
                  placeholder="03xx-xxxxxxx"
                  disabled={isViewer}
                  maxLength={12}
                  style={{ borderColor: fieldErrors.relative_phone ? '#ef4444' : undefined }}
                />
                {fieldErrors.relative_phone && (
                  <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {fieldErrors.relative_phone}
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Relative CNIC (optional)</label>
                <input
                  className="form-input"
                  value={form.relative_cnic}
                  onChange={e => handleFieldChange('relative_cnic', e.target.value)}
                  placeholder="00000-0000000-0"
                  disabled={isViewer}
                  maxLength={15}
                  style={{ borderColor: fieldErrors.relative_cnic ? '#ef4444' : undefined }}
                />
                {fieldErrors.relative_cnic && (
                  <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {fieldErrors.relative_cnic}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Location */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Location &amp; Background
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>City</label>
                <LearningCombobox
                  tableName="cities"
                  value={form.city_id}
                  onChange={v => handleFieldChange('city_id', v)}
                  placeholder="Lahore..."
                  disabled={isViewer}
                />
              </div>

              <div>
                <label style={labelStyle}>Cast (Biradari)</label>
                <LearningCombobox
                  tableName="casts"
                  value={form.cast_id}
                  onChange={v => handleFieldChange('cast_id', v)}
                  placeholder="Rajput..."
                  disabled={isViewer}
                />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Address</label>
                <input
                  className="form-input"
                  value={form.address}
                  onChange={e => handleFieldChange('address', e.target.value)}
                  placeholder="Gali no. 5, Mohalla..."
                  disabled={isViewer}
                />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea
                  className="form-input"
                  value={form.notes}
                  onChange={e => handleFieldChange('notes', e.target.value)}
                  placeholder="Koi bhi zaruri baat..."
                  rows={2}
                  disabled={isViewer}
                  style={{ resize: 'vertical', minHeight: 52 }}
                />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {!isViewer && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => handleSave()}
                disabled={saving || Object.keys(fieldErrors).length > 0}
              >
                {saving ? 'Saving...' : editCustomer ? 'Save Changes' : 'Add Customer'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 };

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [cityId,    setCityId]    = useState('');
  const [castId,    setCastId]    = useState('');
  const [cities,    setCities]    = useState([]);
  const [casts,     setCasts]     = useState([]);
  const [modal,     setModal]     = useState(null);  // null | 'new' | customer-object
  const [userRole,  setUserRole]  = useState('viewer');
  const [deleting,  setDeleting]  = useState(null);

  // Get current user role
  useEffect(() => {
    window.electronAPI?.auth.session().then(r => {
      if (r?.ok) setUserRole(r.user.role);
    });
  }, []);

  useEffect(() => {
    async function fetchLists() {
      const [c, ca] = await Promise.all([
        window.electronAPI?.lists.get('cities'),
        window.electronAPI?.lists.get('casts'),
      ]);
      if (c?.ok)  setCities(c.data);
      if (ca?.ok) setCasts(ca.data);
    }
    fetchLists();
  }, []);

  const reloadRef = useRef(null);

  useEffect(() => {
    async function fetchCustomers() {
      setLoading(true);
      const res = await window.electronAPI?.customers.list({
        search, cityId: cityId || null, castId: castId || null,
      });
      if (res?.ok) setCustomers(res.data || []);
      setLoading(false);
    }
    reloadRef.current = fetchCustomers;
    fetchCustomers();
  }, [search, cityId, castId]);

  function loadCustomers() {
    if (reloadRef.current) reloadRef.current();
  }

  async function handleDelete(customer) {
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone if they have bookings.`)) return;
    setDeleting(customer.id);
    const res = await window.electronAPI?.customers.delete(customer.id);
    if (res?.ok === false) {
      alert(res.message || 'Delete failed.');
    } else {
      loadCustomers();
    }
    setDeleting(null);
  }

  const isOwner   = userRole === 'owner';
  const isViewer  = userRole === 'viewer';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">
            {loading ? 'Loading…' : `${customers.length} customer${customers.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {!isViewer && (
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <Plus size={15} /> Add Customer
          </button>
        )}
      </div>

      <div className="page-body">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 36 }}
              placeholder="Name, phone, CNIC, city se search karein..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="form-input form-select" style={{ width: 140 }} value={cityId} onChange={e => setCityId(e.target.value)}>
            <option value="">All Cities</option>
            {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-input form-select" style={{ width: 140 }} value={castId} onChange={e => setCastId(e.target.value)}>
            <option value="">All Casts</option>
            {casts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(search || cityId || castId) && (
            <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap', alignSelf: 'center' }}
              onClick={() => { setSearch(''); setCityId(''); setCastId(''); }}>
              <X size={12} /> Clear Filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <div>Loading customers...</div>
            </div>
          ) : customers.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <Users size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                {search || cityId || castId ? 'Koi customer nahi mila' : 'Abhi koi customer nahi hai'}
              </div>
              <div style={{ fontSize: 13 }}>
                {search || cityId || castId ? 'Filters clear karein ya alag naam se search karein.' : 'Pehla customer add karein.'}
              </div>
              {!isViewer && !search && !cityId && !castId && (
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setModal('new')}>
                  <Plus size={14} /> Add First Customer
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Relative</th>
                  <th><Phone size={12} style={{ display: 'inline', marginRight: 4 }} />Contact</th>
                  <th><CreditCard size={12} style={{ display: 'inline', marginRight: 4 }} />CNIC</th>
                  <th><MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />City / Cast</th>
                  <th style={{ textAlign: 'center' }}>Bookings</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id}>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{c.name}</div>
                      {c.address && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>{c.address}</div>}
                    </td>
                    <td>
                      {c.relative_name && (
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{c.relative_name}</span>
                          {c.relation_type && (
                            <span className="badge badge-gray" style={{ marginLeft: 5, fontSize: 10 }}>{c.relation_type}</span>
                          )}
                        </div>
                      )}
                      {c.relative_phone && <div style={{ fontSize: 11.5, color: '#64748b', fontFamily: 'monospace' }}>{c.relative_phone}</div>}
                    </td>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.phone || '—'}</div>
                      {c.phone2 && <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#94a3b8' }}>{c.phone2}</div>}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{c.cnic || '—'}</td>
                    <td>
                      {c.city && <div style={{ fontSize: 13 }}>{c.city}</div>}
                      {c.cast && <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{c.cast}</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-purple">{c.booking_count}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {!isViewer && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setModal(c)}>
                            <Edit size={12} /> Edit
                          </button>
                        )}
                        {isOwner && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: '#ef4444' }}
                            onClick={() => handleDelete(c)}
                            disabled={deleting === c.id}
                          >
                            {deleting === c.id ? '...' : <><Trash2 size={12} /> Delete</>}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {customers.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
              {customers.length} customer{customers.length !== 1 ? 's' : ''}
              {(search || cityId || castId) && ' (filtered)'}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <CustomerModal
          editCustomer={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={loadCustomers}
          userRole={userRole}
        />
      )}
    </div>
  );
}
