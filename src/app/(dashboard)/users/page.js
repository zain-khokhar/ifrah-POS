'use client';
import { UserCog, Plus, Shield, Eye, Edit, Trash2 } from 'lucide-react';

const MOCK_USERS = [
  { id: 1, name: 'Shop Owner',  username: 'owner',   role: 'owner',   lastLogin: '09 Oct 2026, 09:30 AM', status: 'active' },
  { id: 2, name: 'Ali Cashier', username: 'cashier', role: 'cashier', lastLogin: '09 Oct 2026, 10:15 AM', status: 'active' },
  { id: 3, name: 'Viewer',      username: 'viewer',  role: 'viewer',  lastLogin: '08 Oct 2026, 02:00 PM', status: 'active' },
];

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
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Staff accounts aur permissions manage karein</p>
        </div>
        <button className="btn btn-primary">
          <Plus size={15} /> Add User
        </button>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Users List */}
          <div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Staff Accounts</h2>
              </div>
              {MOCK_USERS.map(u => {
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
                      <div style={{ fontSize: 12, color: '#64748b' }}>@{u.username} • Last: {u.lastLogin}</div>
                    </div>
                    <span className={`badge ${role.cls}`}>{role.label}</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn-icon" title="Edit"><Edit size={13} /></button>
                      {u.role !== 'owner' && (
                        <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ padding: '10px 16px', fontSize: 12, color: '#94a3b8' }}>
                Phase 2 mein real auth aayega
              </div>
            </div>
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
      </div>
    </div>
  );
}
