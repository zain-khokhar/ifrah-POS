'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Users, X, ChevronDown, Check,
  Phone, CreditCard, MapPin, User, Edit, Trash2, Eye,
  RefreshCw, AlertCircle, History, Calendar, Printer,
  FileText, Sparkles, CheckCircle2, Clock
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';
import { formatPakPhone, cnicMask, validateCustomer } from '@/lib/customerValidation';
import ActionMenu from '@/lib/ActionMenu.js/actionMenu';

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
  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
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
  const [dupWarning, setDupWarning] = useState(null);
  const [dupChecked, setDupChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

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

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    None: { cls: 'badge-gray', label: 'None' },
    Open: { cls: 'badge-info', label: 'Open' },
    Pending: { cls: 'badge-warning', label: 'Pending' },
    Delivered: { cls: 'badge-success', label: 'Delivered' },
    Returned: { cls: 'badge-gray', label: 'Returned' },
    Closed: { cls: 'badge-success', label: 'Closed' },
  };
  const s = map[status] || map.None;
  return (
    <span className={`badge ${s.cls}`} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px' }}>
      {s.label}
    </span>
  );
}

// ─── Customer Bookings History Modal ──────────────────────────────────────────
function CustomerBookingsModal({ customer, onClose, onSelectBookingReceipt }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!customer?.id) return;
    let active = true;

    async function loadCustomerBookings() {
      setLoading(true);
      setError('');
      try {
        let loadedData = null;

        // 1. Try customer-specific IPC
        try {
          const res = await window.electronAPI?.customers?.bookings?.(customer.id);
          if (res?.ok && res.data) {
            loadedData = res.data;
          }
        } catch (e) { }

        // 2. Try customer history IPC
        if (!loadedData) {
          try {
            const res2 = await window.electronAPI?.customers?.history?.(customer.id);
            if (res2?.ok && res2.data) {
              loadedData = res2.data;
            }
          } catch (e) { }
        }

        // 3. Robust client-side fallback via bookings.list
        if (!loadedData) {
          let listRes = await window.electronAPI?.bookings?.list({ customerId: customer.id, limit: 500 });
          let allList = (listRes?.ok && Array.isArray(listRes.data)) ? listRes.data : [];

          // Match by customer id, phone, or name
          let matched = allList.filter(b =>
            b.customer_id === customer.id ||
            (customer.phone && b.customer_phone === customer.phone) ||
            (customer.name && b.customer_name?.toLowerCase().trim() === customer.name?.toLowerCase().trim())
          );

          if (matched.length === 0) {
            // Broad search fallback
            const broadRes = await window.electronAPI?.bookings?.list({ limit: 1000 });
            if (broadRes?.ok && Array.isArray(broadRes.data)) {
              matched = broadRes.data.filter(b =>
                b.customer_id === customer.id ||
                (customer.phone && b.customer_phone === customer.phone) ||
                (customer.name && b.customer_name?.toLowerCase().trim() === customer.name?.toLowerCase().trim())
              );
            }
          }

          // Fetch items for matched bookings
          const enriched = await Promise.all(
            matched.map(async (b) => {
              try {
                const full = await window.electronAPI?.bookings?.get(b.id);
                if (full?.ok && full.data) {
                  return {
                    ...b,
                    items: full.data.items || [],
                  };
                }
              } catch (e) { }
              return b;
            })
          );

          enriched.sort((a, b) => (b.booking_no || 0) - (a.booking_no || 0));

          loadedData = {
            customer,
            bookings: enriched,
          };
        }

        if (active) {
          setData(loadedData);
        }
      } catch (err) {
        if (active) setError(err.message || 'Bookings load nahi ho sakeen.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCustomerBookings();
    return () => { active = false; };
  }, [customer?.id]);

  const rawBookings = data?.bookings || [];

  // Filter by status & search
  const filteredBookings = rawBookings.filter(b => {
    if (statusFilter !== 'all') {
      const bStatus = (b.status || '').toLowerCase();
      if (statusFilter === 'open' && bStatus !== 'open') return false;
      if (statusFilter === 'pending' && bStatus !== 'pending') return false;
      if (statusFilter === 'delivered' && bStatus !== 'delivered' && !b.delivered_on) return false;
      if (statusFilter === 'closed' && bStatus !== 'closed' && bStatus !== 'returned') return false;
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchNo = String(b.booking_no || '').includes(q);
      const matchDresses = (b.dresses_summary || '').toLowerCase().includes(q);
      const matchItems = (b.items || []).some(it =>
        (it.dress_name_snapshot || '').toLowerCase().includes(q) ||
        (it.size || '').toLowerCase().includes(q)
      );
      const matchNotes = (b.notes || '').toLowerCase().includes(q);
      if (!matchNo && !matchDresses && !matchItems && !matchNotes) return false;
    }

    return true;
  });

  // Calculate summary metrics
  const totalAmount = rawBookings.reduce((sum, b) => sum + (b.grand_total || 0), 0);
  const totalPaid = rawBookings.reduce((sum, b) => sum + (b.amount_paid || 0), 0);
  const totalDue = rawBookings.reduce((sum, b) => sum + (b.remaining || 0), 0);

  const statusCounts = {
    all: rawBookings.length,
    open: rawBookings.filter(b => (b.status || '').toLowerCase() === 'open').length,
    pending: rawBookings.filter(b => (b.status || '').toLowerCase() === 'pending').length,
    delivered: rawBookings.filter(b => (b.status || '').toLowerCase() === 'delivered' || b.delivered_on).length,
    closed: rawBookings.filter(b => ['closed', 'returned'].includes((b.status || '').toLowerCase())).length,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: 'white', borderRadius: 14, width: '100%', maxWidth: 1040,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', background: '#7c3aed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 800, fontSize: 16, boxShadow: '0 2px 6px rgba(124,58,237,0.3)'
              }}>
                {(customer.name || 'C')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {customer.name}
                  </h2>
                  <span className="badge badge-purple" style={{ fontSize: 11, fontWeight: 700 }}>
                    {rawBookings.length} {rawBookings.length === 1 ? 'Booking' : 'Bookings'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap', fontSize: 12.5, color: '#64748b' }}>
                  {customer.phone && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontWeight: 600 }}>
                      <Phone size={12} style={{ color: '#7c3aed' }} /> {customer.phone}
                    </span>
                  )}
                  {customer.cnic && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace' }}>
                      <CreditCard size={12} /> {customer.cnic}
                    </span>
                  )}
                  {(customer.city || customer.cast) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} /> {[customer.city, customer.cast].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {customer.relative_name && (
                    <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, color: '#475569' }}>
                      {customer.relative_name} {customer.relation_type ? `(${customer.relation_type})` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
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

        {/* Financial KPI Summary Cards */}
        <div style={{
          padding: '12px 24px', background: '#fcfcfd', borderBottom: '1px solid #f1f5f9',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12
        }}>
          <div style={{ background: 'white', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Total Bookings
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
              {rawBookings.length}
            </div>
          </div>
          <div style={{ background: 'white', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Total Business
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
              Rs. {totalAmount.toLocaleString()}
            </div>
          </div>
          <div style={{ background: 'white', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Total Paid
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginTop: 2 }}>
              Rs. {totalPaid.toLocaleString()}
            </div>
          </div>
          <div style={{ background: 'white', padding: '10px 14px', borderRadius: 8, border: totalDue > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0', background: totalDue > 0 ? '#fff5f5' : '#f0fdf4' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: totalDue > 0 ? '#dc2626' : '#16a34a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {totalDue > 0 ? 'Remaining Balance' : 'Balance Status'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: totalDue > 0 ? '#dc2626' : '#16a34a', marginTop: 2 }}>
              {totalDue > 0 ? `Rs. ${totalDue.toLocaleString()}` : 'Fully Cleared ✓'}
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{
          padding: '12px 24px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: '#ffffff'
        }}>
          {/* Status Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `All (${statusCounts.all})` },
              { id: 'open', label: `Open (${statusCounts.open})` },
              { id: 'pending', label: `Pending (${statusCounts.pending})` },
              { id: 'delivered', label: `Delivered (${statusCounts.delivered})` },
              { id: 'closed', label: `Closed (${statusCounts.closed})` },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: statusFilter === f.id ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                  background: statusFilter === f.id ? '#7c3aed' : '#ffffff',
                  color: statusFilter === f.id ? '#ffffff' : '#475569',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Quick Search */}
          <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 220, flex: '0 1 260px' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              className="form-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Booking # ya dress search..."
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
          ) : filteredBookings.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center', color: '#64748b' }}>
              <History size={40} style={{ marginBottom: 12, opacity: 0.35, color: '#7c3aed' }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                Koi booking record nahi mila
              </div>
              <p style={{ fontSize: 13, color: '#64748b', maxWidth: 360, margin: '0 auto' }}>
                {statusFilter !== 'all' || search
                  ? 'Is filter ke mutabiq koi booking nahi mili.'
                  : 'Is customer ki abhi tak koi booking record nahi hui.'}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 95 }}>Booking #</th>
                  <th style={{ width: 140 }}>Dates</th>
                  <th>Dresses Booked</th>
                  <th style={{ textAlign: 'right', width: 150 }}>Financials</th>
                  <th style={{ textAlign: 'center', width: 100 }}>Status</th>
                  <th style={{ textAlign: 'center', width: 110 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map(b => (
                  <tr
                    key={b.id}
                    onClick={() => onSelectBookingReceipt(b.id)}
                    style={{ cursor: 'pointer' }}
                    title="Click karein receipt dekhne ke liye"
                  >
                    {/* Booking # */}
                    <td>
                      <div style={{ fontWeight: 800, color: '#7c3aed', fontSize: 14 }}>
                        #{b.booking_no}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                        {b.booking_date || '—'}
                      </div>
                    </td>

                    {/* Dates */}
                    <td>
                      <div style={{ fontSize: 12.5, color: '#0f172a', fontWeight: 600 }}>
                        Pohnch: {b.delivery_date || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        Wapsi: {b.returning_date || 'Open'}
                      </div>
                      {b.delivered_on && (
                        <div style={{ fontSize: 10.5, color: '#16a34a', marginTop: 2, fontWeight: 600 }}>
                          ✓ Delivered
                        </div>
                      )}
                    </td>

                    {/* Dresses */}
                    <td>
                      {b.items && b.items.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {b.items.map(it => (
                            <div key={it.id || it.detail_no || it.line_no} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                {it.dress_name_snapshot || 'Dress'}
                              </span>
                              {it.size && (
                                <span className="badge badge-gray" style={{ fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>
                                  {it.size}
                                </span>
                              )}
                              <span style={{ fontSize: 11.5, color: '#64748b', marginLeft: 'auto' }}>
                                Rs. {(it.rate || it.line_total || 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>
                          {b.dresses_summary || 'Dress items'}
                        </div>
                      )}
                    </td>

                    {/* Financials */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                        Rs. {(b.grand_total || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        Paid: Rs. {(b.amount_paid || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: (b.remaining || 0) > 0 ? '#dc2626' : '#16a34a', marginTop: 1 }}>
                        {(b.remaining || 0) > 0 ? `Rs. ${(b.remaining || 0).toLocaleString()} Due` : 'Fully Paid ✓'}
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge status={b.status} />
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSelectBookingReceipt(b.id)}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '4px 10px',
                          color: '#7c3aed',
                          borderColor: '#ddd6fe',
                          background: '#f5f3ff'
                        }}
                        title="Is booking ki receipt dekhein / print karein"
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
            Showing <strong>{filteredBookings.length}</strong> of {rawBookings.length} bookings
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Band Karein
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cityId, setCityId] = useState('');
  const [castId, setCastId] = useState('');
  const [cities, setCities] = useState([]);
  const [casts, setCasts] = useState([]);
  const [modal, setModal] = useState(null);  // null | 'new' | customer-object
  const [userRole, setUserRole] = useState('viewer');
  const [deleting, setDeleting] = useState(null);

  // Customer Bookings History & Receipt Modal state
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [printBookingId, setPrintBookingId] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

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
      if (c?.ok) setCities(c.data);
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

  const isOwner = userRole === 'owner';
  const isViewer = userRole === 'viewer';

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
                  <tr
                    key={c.id}
                    onClick={() => setHistoryCustomer(c)}
                    style={{ cursor: 'pointer' }}
                    title="Is customer ki tamam bookings dekhne ke liye click karein"
                  >
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
                    <td style={{ textAlign: 'center' }} onClick={e => { e.stopPropagation(); setHistoryCustomer(c); }}>
                      <span
                        className="badge badge-purple"
                        style={{
                          cursor: 'pointer',
                          fontWeight: 800,
                          padding: '3px 10px',
                          boxShadow: '0 1px 3px rgba(124,58,237,0.15)'
                        }}
                        title="Click to view all bookings"
                      >
                        {c.booking_count}
                      </span>
                    </td>
                    {/* Actions */}
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <ActionMenu
                          items={[
                            {
                              key: 'bookings',
                              label: 'Bookings',
                              icon: <History size={13} />,
                              color: '#7c3aed',
                              onClick: () => setHistoryCustomer(c),
                            },
                            !isViewer && {
                              key: 'edit',
                              label: 'Edit',
                              icon: <Edit size={13} />,
                              onClick: () => setModal(c),
                            },
                            isOwner && {
                              key: 'delete',
                              label: deleting === c.id ? 'Deleting...' : 'Delete',
                              icon: <Trash2 size={13} />,
                              color: '#ef4444',
                              disabled: deleting === c.id,
                              onClick: () => handleDelete(c),
                            },
                          ].filter(Boolean)}
                        />
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

      {/* Customer Form Modal */}
      {modal && (
        <CustomerModal
          editCustomer={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={loadCustomers}
          userRole={userRole}
        />
      )}

      {/* Customer Bookings History Modal */}
      {historyCustomer && (
        <CustomerBookingsModal
          customer={historyCustomer}
          onClose={() => setHistoryCustomer(null)}
          onSelectBookingReceipt={(bookingId) => {
            setPrintBookingId(bookingId);
            setShowReceiptModal(true);
          }}
        />
      )}

      {/* Receipt Modal */}
      {showReceiptModal && printBookingId && (
        <ReceiptModal
          bookingId={printBookingId}
          isOpen={showReceiptModal}
          onClose={() => {
            setShowReceiptModal(false);
            setPrintBookingId(null);
          }}
          onPrintComplete={() => {
            loadCustomers();
          }}
        />
      )}
    </div>
  );
}
