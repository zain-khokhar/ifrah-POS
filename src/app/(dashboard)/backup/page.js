'use client';
import { Database, Download, Upload, RefreshCw, Cloud, HardDrive, CheckCircle2 } from 'lucide-react';

const MOCK_BACKUPS = [
  { name: '2026-10-09-09-00.sqlite', size: '2.4 MB', date: '09 Oct 2026, 09:00 AM', type: 'auto'   },
  { name: '2026-10-08-09-00.sqlite', size: '2.1 MB', date: '08 Oct 2026, 09:00 AM', type: 'auto'   },
  { name: '2026-10-07-manual.sqlite', size: '1.9 MB', date: '07 Oct 2026, 03:45 PM', type: 'manual' },
  { name: '2026-10-06-09-00.sqlite', size: '1.8 MB', date: '06 Oct 2026, 09:00 AM', type: 'auto'   },
];

export default function BackupPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Backup & Sync</h1>
          <p className="page-subtitle">Local backup aur Supabase cloud sync manage karein</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary">
            <Download size={14} /> Manual Backup
          </button>
          <button className="btn btn-primary" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
            <RefreshCw size={14} /> Sync Now
          </button>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Local Backup */}
          <div>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  <HardDrive size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  Local Backup History
                </h2>
                <span className="badge badge-success">Auto Daily</span>
              </div>
              {MOCK_BACKUPS.map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#64748b',
                  }}>
                    <Database size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>{b.name}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{b.date} • {b.size}</div>
                  </div>
                  <span className={`badge ${b.type === 'auto' ? 'badge-gray' : 'badge-purple'}`} style={{ fontSize: 10 }}>
                    {b.type}
                  </span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-secondary btn-sm"><Download size={11} /></button>
                    <button className="btn btn-secondary btn-sm" style={{ color: '#f59e0b' }}>
                      <Upload size={11} /> Restore
                    </button>
                  </div>
                </div>
              ))}
              <div style={{ padding: '10px 16px', fontSize: 12, color: '#94a3b8' }}>
                Phase 12 mein auto-backup aur restore implement hoga
              </div>
            </div>
          </div>

          {/* Sync Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  <Cloud size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  Supabase Cloud Sync
                </h2>
                <span className="coming-soon-badge">Phase 11</span>
              </div>
              <div className="card-body">
                <div style={{
                  padding: '20px', textAlign: 'center',
                  background: '#f8fafc', borderRadius: 10,
                  border: '1px dashed #e2e8f0',
                }}>
                  <Cloud size={36} style={{ color: '#cbd5e1', marginBottom: 12 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>
                    Supabase Sync — Phase 11
                  </div>
                  <div style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>
                    Online sync Phase 11 mein aayega. Abhi sirf local SQLite kaam karega.
                    Internet ke bina bhi sab kuch normally chalega.
                  </div>
                </div>

                {/* Sync Stats Preview */}
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Sync Status',      value: 'Offline Mode',   color: '#f59e0b' },
                    { label: 'Last Sync',         value: 'Never',          color: '#94a3b8' },
                    { label: 'Pending Changes',   value: '—',              color: '#94a3b8' },
                    { label: 'Conflicts',         value: '0',              color: '#10b981' },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#64748b' }}>{s.label}</span>
                      <span style={{ fontWeight: 700, color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Backup Settings */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Backup Settings</h2>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Auto Backup</label>
                  <select className="form-input">
                    <option>Daily (Recommended)</option>
                    <option>Weekly</option>
                    <option>Manual Only</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Backup Location</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-input" value="C:\ifrah-backup\" readOnly style={{ background: '#f8fafc' }} />
                    <button className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }}>Change</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
