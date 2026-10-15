'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Search, X, Check, ChevronDown, RefreshCw,
  Edit, Shirt, Tag, ToggleLeft, ToggleRight, Upload, Image,
  History, Calendar, Printer, FileText, Phone, MapPin, Eye, Sparkles
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';

// ─── Three-dots Action Menu (fixed-position so table overflow can't clip it) ─
function ActionMenu({ items }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  function toggle(e) {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btnRef.current.getBoundingClientRect();
    const menuH = items.length * 36 + 8;
    const top = r.bottom + menuH > window.innerHeight ? r.top - menuH - 4 : r.bottom + 4;
    setPos({ top, left: Math.max(8, r.right - 160) });
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={toggle}
        title="Actions"
        style={{ padding: '4px 8px', fontSize: 16, fontWeight: 800, lineHeight: 1 }}
      >
        ⋮
      </button>
      {pos && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: 160, zIndex: 2000,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)', padding: 4,
          }}
        >
          {items.map(it => (
            <button
              key={it.key}
              type="button"
              disabled={it.disabled}
              onClick={() => { setPos(null); it.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 36,
                padding: '0 10px', border: 'none', background: 'transparent', borderRadius: 6,
                cursor: it.disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                color: it.color || '#1e293b', textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    None: { cls: 'badge-gray', label: 'None' },
    Open: { cls: 'badge-info', label: 'Open' },
    Pending: { cls: 'badge-warning', label: 'Pending' },
    Closed: { cls: 'badge-success', label: 'Closed' },
  };
  const s = map[status] || map.None;
  return (
    <span className={`badge ${s.cls}`} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px' }}>
      {s.label}
    </span>
  );
}

function parseAttachments(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(val).split(',').map(s => s.trim()).filter(Boolean);
  }
}

function ConditionBadge({ status }) {
  if (status === 'need_repair') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>
        ⚠️ Need Repair
      </span>
    );
  }
  if (status === 'need_dry_clean') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>
        🧺 Need Dry Clean
      </span>
    );
  }
  if (status === 'good') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>
        ✓ Good
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>
      ✨ Fresh
    </span>
  );
}

// ─── Learning Combobox (category) ────────────────────────────────────────────
function CategoryCombobox({ value, onChange, disabled }) {
  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
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
  const showAdd = query.trim() && !options.some(o => o.name.toLowerCase() === query.trim().toLowerCase());

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
  const [form, setForm] = useState(editDress ? {
    code: editDress.code || '',
    name: editDress.name || '',
    category_id: editDress.category_id || '',
    size: editDress.size || '',
    rental_price: editDress.rental_price ?? '',
    description: editDress.description || '',
    condition_status: editDress.condition_status || 'fresh',
    attachments: parseAttachments(editDress.attachments),
  } : {
    code: '',
    name: '',
    category_id: '',
    size: '',
    rental_price: '',
    description: '',
    condition_status: 'fresh',
    attachments: [],
  });
  const [customAttachInput, setCustomAttachInput] = useState('');
  const [similar, setSimilar] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [codeHint, setCodeHint] = useState('');

  const [learnedAttachments, setLearnedAttachments] = useState([]);
  const customAttachInputRef = useRef(null);

  const loadLearnedAttachments = useCallback(async () => {
    try {
      const res = await window.electronAPI?.lists.get('dress_attachments');
      if (res?.ok && Array.isArray(res.data)) {
        setLearnedAttachments(res.data);
      }
    } catch (_) { }
  }, []);

  useEffect(() => {
    loadLearnedAttachments();
  }, [loadLearnedAttachments]);

  const addAttachment = async (text) => {
    const raw = String(text || '').trim();
    if (!raw) return;

    const itemsToAdd = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (itemsToAdd.length === 0) return;

    let updatedAtts = [...form.attachments];
    let newToSave = [];

    for (const item of itemsToAdd) {
      if (!updatedAtts.some(a => a.toLowerCase() === item.toLowerCase())) {
        updatedAtts.push(item);
      }
      if (!learnedAttachments.some(o => o.name.toLowerCase() === item.toLowerCase())) {
        newToSave.push(item);
      }
    }

    set('attachments', updatedAtts);
    setCustomAttachInput('');
    customAttachInputRef.current?.focus();

    for (const item of newToSave) {
      try {
        const res = await window.electronAPI?.lists.add('dress_attachments', item);
        if (res?.ok && res.id) {
          setLearnedAttachments(prev => [...prev, { id: res.id, name: item }]);
        }
      } catch (_) { }
    }
  };

  const removeAttachment = (item) => {
    set('attachments', form.attachments.filter(a => a.toLowerCase() !== item.toLowerCase()));
  };

  const deleteLearnedAttachment = async (e, opt) => {
    e.stopPropagation();
    if (!confirm(`Kya aap "${opt.name}" ko saved suggestions se hatana chahte hain?`)) return;
    try {
      await window.electronAPI?.lists.disable('dress_attachments', opt.id);
      setLearnedAttachments(prev => prev.filter(o => o.id !== opt.id));
    } catch (_) { }
  };

  const isOwner = userRole === 'owner';
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
      condition_status: form.condition_status || 'fresh',
      attachments: form.attachments || [],
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

            <div>
              <label style={labelStyle}>Condition Status (حالت)</label>
              <select
                className="form-input form-select"
                value={form.condition_status}
                onChange={e => set('condition_status', e.target.value)}
                disabled={isViewer}
                style={{ fontWeight: 600 }}
              >
                <option value="fresh">✨ Fresh (نئی / بالکل صاف)</option>
                <option value="good">✓ Good (ٹھیک / استعمال شدہ صاف)</option>
                <option value="need_dry_clean">🧺 Need Dry Clean (ڈرائی کلین درکار)</option>
                <option value="need_repair">⚠️ Need Repair (مرمت / سلائی درکار)</option>
              </select>
            </div>

            {/* Dynamic Accessories / Attachments */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Attachments / Accessories (ڈریس کے ساتھ لوازمات)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 28, alignItems: 'center' }}>
                {form.attachments.map((att, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: '#f3e8ff',
                      color: '#7e22ce',
                      border: '1px solid #d8b4fe',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {att}
                    {!isViewer && (
                      <button
                        type="button"
                        onClick={() => removeAttachment(att)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9333ea',
                          padding: '0 2px',
                          fontSize: 14,
                          lineHeight: 1,
                          fontWeight: 800,
                        }}
                        title="Hataein"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {form.attachments.length === 0 && (
                  <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                    Koi attachment shamil nahi hai (No accessories attached)
                  </span>
                )}
              </div>

              {!isViewer && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      ref={customAttachInputRef}
                      className="form-input"
                      value={customAttachInput}
                      autoComplete="off"
                      onChange={e => setCustomAttachInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addAttachment(customAttachInput);
                        }
                      }}
                      placeholder="Nayi attachment likhein aur Enter dabayein (e.g. Belt, Crown, Dupatta)..."
                      style={{ fontSize: 12.5 }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => addAttachment(customAttachInput)}
                      disabled={!customAttachInput.trim()}
                      style={{ padding: '0 14px', fontWeight: 700 }}
                    >
                      + Add
                    </button>
                  </div>

                  {/* Learned Quick Suggestion Chips */}
                  {learnedAttachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Quick Add:</span>
                      {learnedAttachments.map(opt => {
                        const hasIt = form.attachments.some(a => a.toLowerCase() === opt.name.toLowerCase());
                        return (
                          <span
                            key={opt.name}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: hasIt ? '#ede9fe' : '#ffffff',
                              border: `1px solid ${hasIt ? '#8b5cf6' : '#cbd5e1'}`,
                              borderRadius: 6,
                              overflow: 'hidden',
                              fontSize: 11,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (hasIt) {
                                  removeAttachment(opt.name);
                                } else {
                                  addAttachment(opt.name);
                                }
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: hasIt ? '#6d28d9' : '#475569',
                                padding: '3px 8px',
                                fontSize: 11,
                                fontWeight: hasIt ? 700 : 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                              title={hasIt ? 'Deselect' : 'Add to dress'}
                            >
                              {hasIt ? '✓ ' : '+ '}
                              {opt.name}
                            </button>
                            {opt.id && (
                              <button
                                type="button"
                                onClick={(e) => deleteLearnedAttachment(e, opt)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  borderLeft: `1px solid ${hasIt ? '#ddd6fe' : '#e2e8f0'}`,
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                  padding: '3px 5px',
                                  fontSize: 11,
                                  lineHeight: 1,
                                }}
                                title={`"${opt.name}" ko saved suggestions se hatayein`}
                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [search, setSearch] = useState('');

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
                        {`DD: ${b.delivery_date || '—'}`}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        {b.returning_date ? `RD: ${b.returning_date}` : 'Wapsi: Open'}
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
  const [dresses, setDresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateRemark, setDeactivateRemark] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [remarkDress, setRemarkDress] = useState(null);
  const [categories, setCategories] = useState([]);
  const [modal, setModal] = useState(null);
  const [userRole, setUserRole] = useState('viewer');
  const [togglingId, setTogglingId] = useState(null);
  const [exporting, setExporting] = useState(false);

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
        search,
        categoryId: categoryId || null,
        activeOnly,
        inactiveOnly,
        conditionStatus: conditionFilter || null,
      });
      if (res?.ok) setDresses(res.data || []);
      setLoading(false);
    }
    reloadRef.current = fetchDresses;
    fetchDresses();
  }, [search, categoryId, conditionFilter, activeOnly, inactiveOnly]);

  async function toggleActive(dress) {
    if (dress.active) {
      setDeactivateRemark('');
      setDeactivateTarget(dress);
      return;
    }
    setTogglingId(dress.id);
    await window.electronAPI?.dresses.setActive(dress.id, true);
    if (reloadRef.current) reloadRef.current();
    setTogglingId(null);
  }

  async function confirmDeactivate() {
    if (!deactivateTarget || !deactivateRemark.trim()) return;
    setDeactivating(true);
    const res = await window.electronAPI?.dresses.setActive(deactivateTarget.id, false, deactivateRemark.trim());
    setDeactivating(false);
    if (res?.ok) {
      setDeactivateTarget(null);
      if (reloadRef.current) reloadRef.current();
    } else {
      alert(res?.message || 'Inactive nahi ho saka.');
    }
  }

  async function handleExport(kind) {
    setExporting(kind);
    try {
      const filters = {
        search,
        categoryId: categoryId || null,
        activeOnly,
        inactiveOnly,
        conditionStatus: conditionFilter || null,
      };
      const api = window.electronAPI?.reports;
      const res = kind === 'pdf'
        ? await api?.exportPdf({ reportType: 'dress_catalogue', filters })
        : await api?.exportExcel({ reportType: 'dress_catalogue', filters });
      if (res?.ok && !res.canceled) {
        alert(`✓ Dress Catalogue ${kind === 'pdf' ? 'PDF' : 'Excel'} saved: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  const isOwner = userRole === 'owner';
  const isViewer = userRole === 'viewer';
  const active = dresses.filter(d => d.active).length;
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => reloadRef.current?.()} title="Refresh Karein" style={{ gap: 5 }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('pdf')} disabled={!!exporting} title="Current filters ke hisab se PDF" style={{ gap: 6, fontWeight: 600, color: '#0f172a' }}>
            <FileText size={13} style={{ color: '#7c3aed' }} /> {exporting === 'pdf' ? 'Exporting...' : 'Export to PDF'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('excel')} disabled={!!exporting} title="Current filters ke hisab se Excel" style={{ gap: 6, fontWeight: 600, color: '#0f172a' }}>
            <Upload size={13} style={{ color: '#10b981' }} /> {exporting === 'excel' ? 'Exporting...' : 'Export to Excel'}
          </button>
          {!isViewer && (
            <button className="btn btn-primary" onClick={() => setModal('new')}>
              <Plus size={15} /> Add Dress
            </button>
          )}
        </div>
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
          <select
            className="form-input form-select"
            style={{ width: 180, fontWeight: conditionFilter ? 700 : 400 }}
            value={conditionFilter}
            onChange={e => setConditionFilter(e.target.value)}
          >
            <option value="">All Conditions</option>
            <option value="fresh">✨ Fresh (صاف)</option>
            <option value="good">✓ Good (ٹھیک)</option>
            <option value="need_dry_clean">🧺 Need Dry Clean</option>
            <option value="need_repair">⚠️ Need Repair</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13.5, color: '#64748b', whiteSpace: 'nowrap', fontWeight: 500 }}>
            <input type="checkbox" checked={activeOnly} onChange={e => { setActiveOnly(e.target.checked); if (e.target.checked) setInactiveOnly(false); }} style={{ width: 14, height: 14, accentColor: '#7c3aed' }} />
            Active only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13.5, color: '#64748b', whiteSpace: 'nowrap', fontWeight: 500 }}>
            <input type="checkbox" checked={inactiveOnly} onChange={e => { setInactiveOnly(e.target.checked); if (e.target.checked) setActiveOnly(false); }} style={{ width: 14, height: 14, accentColor: '#ef4444' }} />
            Inactive only
          </label>
          {(search || categoryId || conditionFilter || activeOnly || inactiveOnly) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setCategoryId(''); setConditionFilter(''); setActiveOnly(false); setInactiveOnly(false); }}>
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
                    <th>Condition</th>
                    <th>Size</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                    <th style={{ textAlign: 'center' }}>Bookings</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center', width: 250 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dresses.map(d => {
                    const attachmentsList = parseAttachments(d.attachments);
                    const needsService = d.condition_status === 'need_dry_clean' || d.condition_status === 'need_repair';
                    return (
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

                        {/* Name & Attachments */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                            {d.name}
                          </div>
                          {d.description && (
                            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                              {d.description}
                            </div>
                          )}
                          {attachmentsList.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {attachmentsList.map((att, i) => (
                                <span
                                  key={i}
                                  style={{
                                    fontSize: 10.5,
                                    background: '#f5f3ff',
                                    color: '#6d28d9',
                                    border: '1px solid #ddd6fe',
                                    borderRadius: 4,
                                    padding: '1px 5px',
                                    fontWeight: 600,
                                  }}
                                >
                                  + {att}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Category */}
                        <td>
                          <span className="badge badge-gray">{d.category || '—'}</span>
                        </td>

                        {/* Condition Status */}
                        <td
                          onClick={!isViewer ? (e => { e.stopPropagation(); setModal(d); }) : undefined}
                          style={!isViewer ? { cursor: 'pointer' } : undefined}
                          title={!isViewer ? 'Condition update karne ke liye click karein' : undefined}
                        >
                          <ConditionBadge status={d.condition_status} />
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
                          {!d.active && d.inactive_remark && (
                            <div
                              title={d.inactive_remark}
                              onClick={() => setRemarkDress(d)}
                              style={{ fontSize: 11, color: '#b91c1c', marginTop: 3, maxWidth: 170, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              Remark: {d.inactive_remark}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <ActionMenu
                              items={[
                                {
                                  key: 'history',
                                  label: 'History',
                                  icon: <History size={13} />,
                                  color: '#7c3aed',
                                  onClick: () => setHistoryDress(d),
                                },
                                !isViewer && {
                                  key: 'edit',
                                  label: 'Edit',
                                  icon: <Edit size={13} />,
                                  onClick: () => setModal(d),
                                },
                                !d.active && {
                                  key: 'remark',
                                  label: 'View Remark',
                                  icon: <FileText size={13} />,
                                  color: '#b45309',
                                  onClick: () => setRemarkDress(d),
                                },
                                isOwner && {
                                  key: 'toggle',
                                  label: d.active ? 'Deactivate' : 'Activate',
                                  icon: d.active ? <ToggleLeft size={13} /> : <ToggleRight size={13} />,
                                  color: d.active ? '#ef4444' : '#10b981',
                                  disabled: togglingId === d.id,
                                  onClick: () => toggleActive(d),
                                },
                              ].filter(Boolean)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

      {/* ─── Deactivate (Remark required) Modal ─────────────────────── */}
      {deactivateTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 440, maxWidth: '95%', padding: 22 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              Dress Inactive Karein — {deactivateTarget.code}
            </h3>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{deactivateTarget.name}</div>
            <label style={labelStyle}>Remark / Wajah (zaroori)</label>
            <textarea
              className="form-input"
              rows={3}
              autoFocus
              placeholder="e.g. Dress kharab ho gayi / bik gayi / kho gayi..."
              value={deactivateRemark}
              onChange={e => setDeactivateRemark(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDeactivateTarget(null)} disabled={deactivating}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                disabled={deactivating || !deactivateRemark.trim()}
                onClick={confirmDeactivate}
              >
                {deactivating ? 'Saving...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── View Remark Modal ─────────────────────────────────────── */}
      {remarkDress && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: 420, maxWidth: '95%', padding: 22 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              Remark — {remarkDress.code}
            </h3>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{remarkDress.name}</div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, fontSize: 13.5, color: '#7f1d1d', whiteSpace: 'pre-wrap' }}>
              {remarkDress.inactive_remark || 'Koi remark darj nahi hai.'}
            </div>
            {remarkDress.inactive_at && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Inactive on: {remarkDress.inactive_at}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRemarkDress(null)}>Band Karein</button>
            </div>
          </div>
        </div>
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
