'use client';
import { Settings, Store, Printer, Globe, Bell, Palette } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Application aur shop ki settings</p>
        </div>
        <button className="btn btn-primary">Save Settings</button>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Shop Info */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title"><Store size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Shop Information</h2>
            </div>
            <div className="card-body">
              {[
                { label: 'Shop Name',    placeholder: 'Ifrah Collection',        type: 'text'  },
                { label: 'Address',      placeholder: 'Shop ka address',         type: 'text'  },
                { label: 'Phone 1',      placeholder: '0300-0000000',            type: 'text'  },
                { label: 'Phone 2',      placeholder: '(Optional)',              type: 'text'  },
                { label: 'City',         placeholder: 'Lahore',                  type: 'text'  },
              ].map(f => (
                <div key={f.label} className="form-group">
                  <label className="form-label">{f.label}</label>
                  <input type={f.type} className="form-input" placeholder={f.placeholder} />
                </div>
              ))}
            </div>
          </div>

          {/* Receipt Settings */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h2 className="card-title"><Printer size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Receipt / Print Settings</h2>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Default Print Format</label>
                  <select className="form-input">
                    <option>A4 Paper</option>
                    <option>80mm Thermal Printer</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Receipt Footer Note</label>
                  <textarea className="form-input" rows={3} placeholder="Thank you for choosing Ifrah Collection!" style={{ resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <input type="checkbox" id="auto-print" style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label htmlFor="auto-print" style={{ fontSize: 13.5, color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                    Booking save hone ke baad auto receipt print karein
                  </label>
                </div>
              </div>
            </div>

            {/* App Info */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">App Information</h2>
              </div>
              <div className="card-body">
                {[
                  { label: 'App Version',   value: 'v0.1.0 (Phase 0)'          },
                  { label: 'Database',      value: 'SQLite (Local) — Phase 1'  },
                  { label: 'Online Sync',   value: 'Supabase — Phase 11'       },
                  { label: 'Platform',      value: 'Windows Desktop (Electron)'},
                ].map(i => (
                  <div key={i.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                    <span style={{ color: '#64748b', fontWeight: 500 }}>{i.label}</span>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{i.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
