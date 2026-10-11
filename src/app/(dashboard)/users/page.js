'use client';
import { useEffect, useState } from 'react';
import {
  UserCog, Plus, Shield, Trash2, Activity, Clock,
  ChevronDown, ChevronRight, ChevronLeft,
  RefreshCw, CheckCircle2
} from 'lucide-react';
import { formatDateTime, formatDate } from '@/lib/dateUtils';

const ROLE_MAP = {
  owner:   { cls: 'badge-purple', label: 'Owner',   desc: 'Sab kuch kar sakta hai' },
  cashier: { cls: 'badge-info',   label: 'Cashier', desc: 'Bookings & payments' },
  viewer:  { cls: 'badge-gray',   label: 'Viewer',  desc: 'Sirf dekh sakta hai' },
};

const PERMISSIONS = [
  { action: 'New Booking',       owner: true,  cashier: true,  viewer: false },
  { action: 'Edit Booking',      owner: true,  cashier: true,  viewer: false },
  { action: 'Delete Booking',    owner: true,  cashier: false, viewer: false },
  { action: 'Customer Manage',   owner: true,  cashier: true,  viewer: false },
  { action: 'Dress Manage',      owner: true,  cashier: false, viewer: false },
  { action: 'Price Change',      owner: true,  cashier: false, viewer: false },
  { action: 'Receive Payment',   owner: true,  cashier: true,  viewer: false },
  { action: 'View Reports',      owner: true,  cashier: true,  viewer: false },
  { action: 'Profit Reports',    owner: true,  cashier: false, viewer: false },
  { action: 'User Management',   owner: true,  cashier: false, viewer: false },
  { action: 'Backup & Restore',  owner: true,  cashier: false, viewer: false },
];

const AUDIT_LIMIT = 10;

const FRIENDLY_FIELDS = {
  active: { label: 'Status', urdu: 'حالت' },
  is_active: { label: 'Account Status', urdu: 'اکاؤنٹ حالت' },
  name: { label: 'Name', urdu: 'نام' },
  phone: { label: 'Mobile Number', urdu: 'موبائل نمبر' },
  phone2: { label: 'Second Phone', urdu: 'دوسرا فون' },
  cnic: { label: 'CNIC', urdu: 'شناختی کارڈ' },
  relative_name: { label: 'Waris / Guarantor', urdu: 'وارث کا نام' },
  relative_phone: { label: 'Waris Phone', urdu: 'وارث کا فون' },
  relative_cnic: { label: 'Waris CNIC', urdu: 'وارث کارڈ' },
  relation_type_id: { label: 'Relation ID', urdu: 'رشتہ' },
  city_id: { label: 'City ID', urdu: 'شہر' },
  city: { label: 'City', urdu: 'شہر' },
  cast_id: { label: 'Cast ID', urdu: 'قوم' },
  cast: { label: 'Cast / Biradari', urdu: 'قوم' },
  address: { label: 'Address', urdu: 'پتہ' },
  notes: { label: 'Notes', urdu: 'نوٹس' },
  role: { label: 'Role', urdu: 'عہدہ' },
  username: { label: 'Username', urdu: 'یوزر نیم' },
  full_name: { label: 'Full Name', urdu: 'پورا نام' },
  rental_price: { label: 'Rental Price', urdu: 'کرایہ' },
  security_deposit: { label: 'Security Deposit', urdu: 'ضمانت' },
  advance_amount: { label: 'Advance Payment', urdu: 'پیشگی رقم' },
  amount: { label: 'Amount Paid', urdu: 'وصول شدہ رقم' },
  payment_method: { label: 'Payment Method', urdu: 'ادائیگی طریقہ' },
  grand_total: { label: 'Total Bill', urdu: 'کل بل' },
  discount: { label: 'Discount', urdu: 'رعایت' },
  booking_no: { label: 'Booking Number', urdu: 'بکنگ نمبر' },
  event_date: { label: 'Event Date', urdu: 'فنکشن کی تاریخ' },
  delivery_date: { label: 'Delivery Date', urdu: 'ڈیلیوری کی تاریخ' },
  return_date: { label: 'Return Date', urdu: 'واپسی کی تاریخ' },
  receipt_print_count: { label: 'Print Counter', urdu: 'پرنٹ بار' },
  printed_at: { label: 'Print Waqt', urdu: 'پرنٹ کا وقت' },
  is_ready: { label: 'Ready Status', urdu: 'تیاری حالت' },
  clash_note: { label: 'Date Clash', urdu: 'تصادم کی تفصیل' },
  other_booking: { label: 'Other Booking #', urdu: 'دوسری بکنگ' },
  filename: { label: 'Backup File', urdu: 'بیک اپ فائل' },
  size: { label: 'File Size', urdu: 'سائز' },
  path: { label: 'Storage Path', urdu: 'فائل لوکیشن' },
  items: { label: 'Total Items', urdu: 'اشیاء کی تعداد' },
};

function formatFriendlyValue(key, val) {
  // Active / Inactive: NEVER show 0 or 1
  if (key === 'active' || key === 'is_active' || key === 'status' || key === 'enabled') {
    if (val === 0 || val === '0' || val === false || val === 'inactive' || val === 'disabled') {
      return { isBadge: true, text: 'Inactive (غیر فعال)', cls: 'badge-danger' };
    }
    if (val === 1 || val === '1' || val === true || val === 'active' || val === 'enabled') {
      return { isBadge: true, text: 'Active (فعال)', cls: 'badge-success' };
    }
  }

  if (key === 'is_ready') {
    if (val === 1 || val === '1' || val === true) {
      return { isBadge: true, text: 'Taiyar (Ready)', cls: 'badge-success' };
    }
    return { isBadge: true, text: 'Taiyar Nahi (Pending)', cls: 'badge-warning' };
  }

  if (val === null || val === undefined || val === '') {
    return { text: '—' };
  }

  if (typeof val === 'boolean') {
    return { text: val ? 'Haan (Yes)' : 'Nahi (No)' };
  }

  const moneyKeys = ['rental_price', 'security_deposit', 'advance_amount', 'amount', 'grand_total', 'discount'];
  if (moneyKeys.includes(key) && !isNaN(Number(val))) {
    return { text: `Rs. ${Number(val).toLocaleString()}` };
  }

  // Format ISO timestamps (e.g. 2026-10-11T13:49:03.527Z)
  if (typeof val === 'string' && val.includes('T')) {
    const formatted = formatDateTime(val);
    if (formatted && formatted !== '—') return { text: formatted };
  }

  // Format standard YYYY-MM-DD
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return { text: formatDate(val) };
  }

  if (Array.isArray(val)) {
    return { text: `${val.length} items` };
  }

  if (typeof val === 'object') {
    try {
      return { text: JSON.stringify(val) };
    } catch {
      return { text: String(val) };
    }
  }

  return { text: String(val) };
}

function getHumanActionInfo(action = '', tableName = '', recordId = '', username = 'System') {
  const act = String(action).toLowerCase();
  const tblName = tableName || '';
  const recId = recordId ? `#${recordId}` : '';

  if (act.includes('deactivate')) {
    const target = tblName === 'dresses' ? 'Dress' : tblName === 'users' ? 'Staff' : tblName;
    return {
      badge: 'غیر فعال (Inactive)',
      badgeCls: 'badge-danger',
      title: `${target} ${recId} Inactive Kiya Gaya`,
      summary: `${username} ne ${target} ${recId} ko Inactive (غیر فعال) kiya`,
    };
  }

  if (act.includes('activate') || act.includes('reactivate')) {
    const target = tblName === 'dresses' ? 'Dress' : tblName === 'users' ? 'Staff' : tblName;
    return {
      badge: 'فعال (Active)',
      badgeCls: 'badge-success',
      title: `${target} ${recId} Active Kiya Gaya`,
      summary: `${username} ne ${target} ${recId} ko Active (فعال) kiya`,
    };
  }

  if (act.includes('update') || act.includes('edit') || act.includes('rename')) {
    const target = tblName === 'customers' ? 'Customer Profile' :
                   tblName === 'dresses' ? 'Dress' :
                   tblName === 'bookings' ? 'Booking' :
                   tblName === 'settings' ? 'Shop Settings' : (tblName || 'Record');
    return {
      badge: 'تبدیلی (Updated)',
      badgeCls: 'badge-info',
      title: `${target} ${recId} Update Hui`,
      summary: `${username} ne ${target} ${recId} ki maloomat update keen`,
    };
  }

  if (act.includes('create') || act.includes('add')) {
    const target = tblName === 'customers' ? 'Naya Customer' :
                   tblName === 'dresses' ? 'Naya Dress' :
                   tblName === 'bookings' ? 'Nayi Booking' :
                   tblName === 'payments' ? 'Payment' :
                   tblName === 'users' ? 'Naya Staff User' : (tblName || 'Record');
    return {
      badge: 'نیا اندراج (Created)',
      badgeCls: 'badge-success',
      title: `${target} ${recId} Shamil Kiya Gaya`,
      summary: `${username} ne ${target} ${recId} banaya`,
    };
  }

  if (act.includes('delete') || act.includes('remove') || act.includes('void') || act.includes('cancel')) {
    return {
      badge: 'منسوخ (Cancelled)',
      badgeCls: 'badge-danger',
      title: `${tblName || 'Record'} ${recId} Delete / Cancel Kiya`,
      summary: `${username} ne record cancel ya delete kiya`,
    };
  }

  if (act.includes('print')) {
    return {
      badge: 'رسید پرنٹ (Print)',
      badgeCls: 'badge-gray',
      title: `Receipt Print ${recId}`,
      summary: `${username} ne booking ${recId} ki receipt print ki`,
    };
  }

  if (act.includes('backup') || act.includes('restore')) {
    const isRestore = act.includes('restore');
    return {
      badge: isRestore ? 'بحالی (Restore)' : 'بیک اپ (Backup)',
      badgeCls: 'badge-purple',
      title: isRestore ? 'Database Restore' : 'System Backup Archive',
      summary: `${username} ne ${isRestore ? 'backup restore kiya' : 'system backup banaya'}`,
    };
  }

  if (act.includes('clash')) {
    return {
      badge: 'تصادم (Clash)',
      badgeCls: 'badge-danger',
      title: `Booking Date Clash ${recId}`,
      summary: `Booking dates clash record hui`,
    };
  }

  if (act.includes('security') || act.includes('auth') || act.includes('password') || act.includes('reset') || act.includes('recovery')) {
    return {
      badge: 'سیکیورٹی (Security)',
      badgeCls: 'badge-purple',
      title: 'Password / Security Action',
      summary: `${username} ne password ya key reset ki`,
    };
  }

  return {
    badge: 'سرگرمی (Activity)',
    badgeCls: 'badge-gray',
    title: action.replace(/[._]/g, ' '),
    summary: `${username} ne karwayi ki`,
  };
}

function parseLogDetails(log) {
  const parseObj = (raw) => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const newObj = parseObj(log.new_values);
  const oldObj = parseObj(log.old_values);

  if (!newObj && !oldObj) {
    const rawVal = log.new_values || log.old_values;
    return rawVal ? [{ label: 'Tafseel', val: String(rawVal) }] : [];
  }

  const IGNORE_KEYS = new Set([
    'updated_at', 'updated_by', 'created_at', 'created_by',
    'sync_id', 'id', 'deleted_at', 'password', 'password_hash'
  ]);

  const norm = (v) => {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  };

  // If both old and new snapshots exist (an edit/update):
  if (oldObj && newObj) {
    const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]))
      .filter(k => !IGNORE_KEYS.has(k));

    const changed = [];
    for (const k of allKeys) {
      const oldV = oldObj[k];
      const newV = newObj[k];
      if (norm(oldV) !== norm(newV)) {
        changed.push({
          label: FRIENDLY_FIELDS[k]?.label || k.replace(/_/g, ' '),
          urdu: FRIENDLY_FIELDS[k]?.urdu || '',
          key: k,
          val: newV,
        });
      }
    }

    if (changed.length > 0) return changed;
    return [{ isNotice: true, text: 'Tamam maloomat pehle jaisi hi hain (Koi tabdeeli nahi hui).' }];
  }

  // Single snapshot (Creation, toggle, or event):
  const target = newObj || oldObj;
  return Object.entries(target)
    .filter(([k, v]) => !IGNORE_KEYS.has(k) && norm(v) !== '')
    .map(([k, v]) => ({
      label: FRIENDLY_FIELDS[k]?.label || k.replace(/_/g, ' '),
      urdu: FRIENDLY_FIELDS[k]?.urdu || '',
      key: k,
      val: v,
    }));
}

function getPageNumbers(curr, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (curr <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (curr >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', curr - 1, curr, curr + 1, '...', total];
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());
  const [form, setForm] = useState({ username: '', fullName: '', password: '', role: 'cashier' });
  const [message, setMessage] = useState('');
  const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('ifrah_user') || 'null') : null;

  const totalAuditPages = Math.max(1, Math.ceil(auditTotal / AUDIT_LIMIT));

  const loadAuditLogs = async (page = 1) => {
    setLoadingAudit(true);
    try {
      const offset = (page - 1) * AUDIT_LIMIT;
      const res = await window.electronAPI.audit.list({ limit: AUDIT_LIMIT, offset });
      if (res?.ok === false) return;

      const items = Array.isArray(res) ? res : (res?.items || []);
      const total = res?.total ?? items.length;

      setAuditLogs(items);
      setAuditTotal(total);
      setAuditPage(page);
    } catch {
      // ignore
    } finally {
      setLoadingAudit(false);
    }
  };

  const load = async () => {
    const userResult = await window.electronAPI.users.list();
    if (userResult?.ok === false) setMessage(userResult.message);
    else setUsers(userResult);

    await loadAuditLogs(1);
  };

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, []);

  const toggleExpand = (id) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createUser = async (event) => {
    event.preventDefault();
    const result = await window.electronAPI.users.create(form);
    if (result?.ok === false) setMessage(result.message);
    else {
      setMessage('User add ho gaya.');
      setForm({ username: '', fullName: '', password: '', role: 'cashier' });
      load();
    }
  };

  const disableUser = async (id) => {
    if (!window.confirm('Is user ko disable karein?')) return;
    const result = await window.electronAPI.users.disable(id);
    setMessage(result?.ok === false ? result.message : 'User disable ho gaya.');
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users & Security</h1>
          <p className="page-subtitle">Staff accounts, permissions aur live system audit log manage karein</p>
        </div>
        {currentUser?.role === 'owner' && (
          <button className="btn btn-primary" onClick={() => document.getElementById('new-user')?.scrollIntoView()}>
            <Plus size={15} /> Add User
          </button>
        )}
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, width: '100%', minWidth: 0 }}>

          {/* Users List */}
          <div style={{ minWidth: 0 }}>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Staff Accounts</h2>
              </div>
              {users.map(u => {
                const role = ROLE_MAP[u.role] || { cls: 'badge-gray', label: u.role };
                return (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 20px',
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: u.role === 'owner' ? 'linear-gradient(135deg,#7c3aed,#ec4899)' :
                                  u.role === 'cashier' ? 'linear-gradient(135deg,#3b82f6,#06b6d4)' :
                                  'linear-gradient(135deg,#64748b,#94a3b8)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 800, fontSize: 15, flexShrink: 0,
                      textTransform: 'uppercase',
                    }}>
                      {u.name ? u.name[0] : 'U'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>@{u.username} • {u.is_active ? 'Active' : 'Disabled'}</div>
                    </div>
                    <span className={`badge ${role.cls}`}>{role.label}</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {u.role !== 'owner' && u.is_active && currentUser?.role === 'owner' && (
                        <button className="btn-icon" title="Disable user" onClick={() => disableUser(u.id)} style={{ color: '#ef4444' }}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              {message && <div style={{ padding: '10px 16px', fontSize: 12, color: '#b45309' }}>{message}</div>}
            </div>

            {currentUser?.role === 'owner' && (
              <form id="new-user" className="card" onSubmit={createUser} style={{ marginTop: 16 }}>
                <div className="card-header"><h2 className="card-title">Add User</h2></div>
                <div className="card-body">
                  {[['fullName', 'Name'], ['username', 'Username'], ['password', 'Password']].map(([key, label]) => (
                    <div className="form-group" key={key}>
                      <label className="form-label">{label}</label>
                      <input className="form-input" type={key === 'password' ? 'password' : 'text'} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} required />
                    </div>
                  ))}
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select className="form-input" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>
                      <option value="cashier">Cashier</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <button className="btn btn-primary" type="submit"><Plus size={14} /> Add User</button>
                </div>
              </form>
            )}
          </div>

          {/* Permissions Matrix */}
          <div style={{ minWidth: 0 }}>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title"><Shield size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Permissions Matrix</h2>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th style={{ textAlign: 'center' }}>Owner</th>
                      <th style={{ textAlign: 'center' }}>Cashier</th>
                      <th style={{ textAlign: 'center' }}>Viewer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.map(p => (
                      <tr key={p.action}>
                        <td style={{ fontSize: 12.5 }}>{p.action}</td>
                        {[p.owner, p.cashier, p.viewer].map((allowed, i) => (
                          <td key={i} style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 14, color: allowed ? '#10b981' : '#cbd5e1' }}>
                              {allowed ? '✓' : '✕'}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* ── Eye-Catchy & Optimized Audit Log ────────────────────────── */}
        {currentUser?.role === 'owner' && (
          <div className="card" id="audit-log-card" style={{ marginTop: 20 }}>
            {/* Header */}
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={17} style={{ color: '#4f46e5' }} />
                  System Audit Log (سسٹم آڈٹ لاگ)
                </h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  Har tabdeeli ka aam faham record — Visual Diff aur tafseelat ke sath
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge badge-purple" style={{ fontSize: 12, padding: '4px 10px' }}>
                  Safah {auditPage} of {totalAuditPages} ({auditTotal} Kul Logs)
                </span>

                <button
                  type="button"
                  onClick={() => loadAuditLogs(auditPage)}
                  disabled={loadingAudit}
                  title="Taaza karein (Refresh)"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#4f46e5',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <RefreshCw size={13} className={loadingAudit ? 'spin' : ''} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Content List */}
            {loadingAudit && auditLogs.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={28} className="spin" style={{ margin: '0 auto 10px', color: '#4f46e5' }} />
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>Audit logs load ho rahe hain...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                <Clock size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Koi audit activities mojood nahi hain</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {auditLogs.map((log, idx) => {
                  const meta = getHumanActionInfo(log.action, log.table_name, log.record_id, log.username);
                  const isExpanded = expandedLogIds.has(log.id);
                  const fields = parseLogDetails(log);
                  const hasDetails = fields.length > 0;

                  return (
                    <div
                      key={log.id || idx}
                      style={{
                        padding: '16px 20px',
                        borderBottom: idx === auditLogs.length - 1 ? 'none' : '1px solid #f1f5f9',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* Top Row: Action Pill, Human Summary, Timestamp & Toggle */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        {/* Left Info: Badge & Human friendly text */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span className={`badge ${meta.badgeCls}`} style={{ fontSize: 11, padding: '3px 9px' }}>
                            {meta.badge}
                          </span>

                          <div style={{ fontSize: 13.5, color: '#0f172a' }}>
                            <strong style={{ color: '#0f172a', fontWeight: 700 }}>
                              {log.username || 'System'}
                            </strong>
                            <span style={{ color: '#94a3b8', margin: '0 6px' }}>•</span>
                            <span style={{ color: '#334155', fontWeight: 600 }}>
                              {meta.title}
                            </span>
                          </div>
                        </div>

                        {/* Right Timestamp & Details Toggle Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Clock size={12} />
                            {formatDateTime(log.created_at)}
                          </span>

                          {hasDetails && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(log.id)}
                              style={{
                                background: isExpanded ? '#ede9fe' : '#ffffff',
                                border: isExpanded ? '1px solid #c4b5fd' : '1px solid #cbd5e1',
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                color: isExpanded ? '#6d28d9' : '#4f46e5',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {isExpanded ? 'Chupayein (Hide)' : 'Tafseelat (Details)'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Summary sentence */}
                      <div style={{ fontSize: 12.5, color: '#64748b', margin: '-2px 0 0 2px' }}>
                        {meta.summary}
                      </div>

                      {/* Expandable Details Container */}
                      {isExpanded && hasDetails && (
                        <div
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 8,
                            padding: '12px 14px',
                            marginTop: 4,
                          }}
                        >
                          {fields[0]?.isNotice ? (
                            <div style={{ fontSize: 12.5, color: '#64748b', fontStyle: 'italic' }}>
                              {fields[0].text}
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                              {fields.map((item, fIdx) => {
                                const valFmt = formatFriendlyValue(item.key, item.val);
                                return (
                                  <div
                                    key={`${item.key || fIdx}-${fIdx}`}
                                    style={{
                                      background: '#ffffff',
                                      border: '1px solid #e2e8f0',
                                      borderRadius: 8,
                                      padding: '8px 12px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 4,
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                    }}
                                  >
                                    <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                                      {item.label} {item.urdu && <span style={{ opacity: 0.8 }}>({item.urdu})</span>}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>
                                      {valFmt.isBadge ? (
                                        <span className={`badge ${valFmt.cls}`} style={{ fontSize: 11.5, padding: '3px 8px' }}>
                                          {valFmt.text}
                                        </span>
                                      ) : (
                                        valFmt.text
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ── Bottom Pagination Bar (No endless Show More scroll) ── */}
                {totalAuditPages > 1 && (
                  <div style={{
                    padding: '14px 20px',
                    borderTop: '1px solid #f1f5f9',
                    background: '#fafbfc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}>
                    <div style={{ fontSize: 12.5, color: '#64748b' }}>
                      Safah <strong>{auditPage}</strong> of <strong>{totalAuditPages}</strong> (Showing {(auditPage - 1) * AUDIT_LIMIT + 1}–{Math.min(auditPage * AUDIT_LIMIT, auditTotal)} of <strong>{auditTotal}</strong> activities)
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Previous Page */}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => loadAuditLogs(auditPage - 1)}
                        disabled={auditPage <= 1 || loadingAudit}
                        style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <ChevronLeft size={14} /> Pichla (Prev)
                      </button>

                      {/* Numeric Page Buttons */}
                      {getPageNumbers(auditPage, totalAuditPages).map((p, pIdx) => (
                        typeof p === 'number' ? (
                          <button
                            key={p}
                            type="button"
                            onClick={() => loadAuditLogs(p)}
                            disabled={loadingAudit}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              border: p === auditPage ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                              background: p === auditPage ? '#4f46e5' : '#ffffff',
                              color: p === auditPage ? '#ffffff' : '#334155',
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {p}
                          </button>
                        ) : (
                          <span key={`dots-${pIdx}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: 12 }}>…</span>
                        )
                      ))}

                      {/* Next Page */}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => loadAuditLogs(auditPage + 1)}
                        disabled={auditPage >= totalAuditPages || loadingAudit}
                        style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        Agla (Next) <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

