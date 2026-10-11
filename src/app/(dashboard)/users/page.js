'use client';
import { useEffect, useState } from 'react';
import { UserCog, Plus, Shield, Trash2 } from 'lucide-react';

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

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [form, setForm] = useState({ username: '', fullName: '', password: '', role: 'cashier' });
  const [message, setMessage] = useState('');
  const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('ifrah_user') || 'null') : null;

  const load = async () => {
    const [userResult, auditResult] = await Promise.all([
      window.electronAPI.users.list(),
      window.electronAPI.audit.list(),
    ]);
    if (userResult?.ok === false) setMessage(userResult.message);
    else setUsers(userResult);
    if (auditResult?.ok === false) setMessage(auditResult.message);
    else setAuditLogs(auditResult);
  };

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, []);

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
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Staff accounts aur permissions manage karein</p>
        </div>
        {currentUser?.role === 'owner' && <button className="btn btn-primary" onClick={() => document.getElementById('new-user')?.scrollIntoView()}><Plus size={15} /> Add User</button>}
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Users List */}
          <div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Staff Accounts</h2>
              </div>
              {users.map(u => {
                const role = ROLE_MAP[u.role];
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
                      {u.name[0]}
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

            {currentUser?.role === 'owner' && <form id="new-user" className="card" onSubmit={createUser} style={{ marginTop: 16 }}>
              <div className="card-header"><h2 className="card-title">Add User</h2></div>
              <div className="card-body">
                {[['fullName', 'Name'], ['username', 'Username'], ['password', 'Password']].map(([key, label]) => (
                  <div className="form-group" key={key}><label className="form-label">{label}</label><input className="form-input" type={key === 'password' ? 'password' : 'text'} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} required /></div>
                ))}
                <div className="form-group"><label className="form-label">Role</label><select className="form-input" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}><option value="cashier">Cashier</option><option value="viewer">Viewer</option></select></div>
                <button className="btn btn-primary" type="submit"><Plus size={14} /> Add User</button>
              </div>
            </form>}
          </div>

          {/* Permissions Matrix */}
          <div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title"><Shield size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Permissions Matrix</h2>
              </div>
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
                          <span style={{ fontSize: 14, color: allowed ? '#10b981' : '#e2e8f0' }}>
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

        {currentUser?.role === 'owner' && <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2 className="card-title">Audit Log</h2></div>
          <table className="data-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Table</th><th>Record</th><th>Changes</th></tr></thead><tbody>
            {auditLogs.map(log => <tr key={log.id}><td>{log.created_at}</td><td>{log.username || 'System'}</td><td>{log.action}</td><td>{log.table_name}</td><td>{log.record_id || '-'}</td><td>{log.new_values || '-'}</td></tr>)}
          </tbody></table>
        </div>}
      </div>
    </div>
  );
}
