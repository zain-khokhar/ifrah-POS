'use client';

import { useState, useEffect } from 'react';
import {
  Settings, Store, Printer, Check, RefreshCw,
  AlertCircle, ShieldAlert, Cpu
} from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [userRole, setUserRole] = useState('viewer');

  // Available printers
  const [printers, setPrinters] = useState([]);

  // Settings state
  const [formData, setFormData] = useState({
    shop_name: 'Ifrah Collection',
    shop_tagline: 'Exclusive Bridal & Party Wear',
    shop_address: 'Main Bazaar, Near Bank Alfalah',
    shop_phone: '0300-1234567',
    shop_phone2: '',
    shop_city: 'Lahore',
    receipt_default_layout: '80mm',
    printer_80mm: '',
    printer_a4: '',
    receipt_footer_ur: 'واپسی پر ڈریس صاف اور درست حالت میں واپس کرنا لازمی ہے۔ تاخیر کی صورت میں یومیہ کرایہ وصول ہوگا۔',
    receipt_footer_en: 'Dress must be returned in good condition. Late return will incur daily rental charges.',
    receipt_reprint_watermark: '1',
  });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const session = await window.electronAPI?.auth.session();
        if (session?.ok) setUserRole(session.user.role);

        const [sRes, pRes] = await Promise.all([
          window.electronAPI?.settings.get(),
          window.electronAPI?.receipts.getPrinters(),
        ]);

        if (sRes?.ok && sRes.data) {
          setFormData(prev => ({
            ...prev,
            ...sRes.data,
          }));
        }

        if (pRes?.ok && Array.isArray(pRes.data)) {
          setPrinters(pRes.data);
        }
      } catch (err) {
        setError(err.message || 'Settings load nahi ho sakeen.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  function handleChange(field, val) {
    setFormData(prev => ({ ...prev, [field]: val }));
    setSaved(false);
  }

  async function handleSave() {
    if (saving || userRole !== 'owner') return;
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const res = await window.electronAPI?.settings.update(formData);
      if (res?.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        throw new Error(res?.message || 'Settings update failed.');
      }
    } catch (err) {
      setError(err.message || 'Settings save karne mein masla aya.');
    } finally {
      setSaving(false);
    }
  }

  const isOwner = userRole === 'owner';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Shop information, receipt footer aur hardware printer settings</p>
        </div>
        {isOwner ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || loading}
            style={{ minWidth: 140 }}
          >
            {saved ? (
              <><Check size={14} /> Settings Saved!</>
            ) : saving ? (
              <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
            ) : (
              'Save Settings'
            )}
          </button>
        ) : (
          <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
            Sirf Owner settings tabdeel kar sakta hai
          </div>
        )}
      </div>

      <div className="page-body">
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: '12px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {saved && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
            padding: '12px 14px', color: '#166534', fontSize: 13, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Check size={16} />
            <span>Settings kamyabi se save ho gayeen! Ab agli tamam receipts par yehi details print hon gi.</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* ── CARD 1: Shop Information ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                <Store size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#7c3aed' }} />
                Shop Information (رسید پر پرنٹ ہونے والی معلومات)
              </h2>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">Shop Name (دکان کا نام)</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.shop_name}
                  onChange={e => handleChange('shop_name', e.target.value)}
                  disabled={!isOwner}
                  placeholder="e.g. Ifrah Collection"
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div>
                <label className="form-label">Tagline / Subtitle (ذیلی عنوان)</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.shop_tagline}
                  onChange={e => handleChange('shop_tagline', e.target.value)}
                  disabled={!isOwner}
                  placeholder="e.g. Exclusive Bridal & Party Wear"
                />
              </div>

              <div>
                <label className="form-label">Address (پتہ)</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.shop_address}
                  onChange={e => handleChange('shop_address', e.target.value)}
                  disabled={!isOwner}
                  placeholder="e.g. Main Bazaar, Near Bank Alfalah"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Phone 1 (فون نمبر ۱)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.shop_phone}
                    onChange={e => handleChange('shop_phone', e.target.value)}
                    disabled={!isOwner}
                    placeholder="0300-1234567"
                  />
                </div>
                <div>
                  <label className="form-label">Phone 2 (اختیاری)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.shop_phone2}
                    onChange={e => handleChange('shop_phone2', e.target.value)}
                    disabled={!isOwner}
                    placeholder="0321-7654321"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">City (شہر)</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.shop_city}
                  onChange={e => handleChange('shop_city', e.target.value)}
                  disabled={!isOwner}
                  placeholder="Lahore"
                />
              </div>
            </div>
          </div>

          {/* ── CARD 2: Receipt & Hardware Settings ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  <Printer size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#7c3aed' }} />
                  Receipt &amp; Hardware Printing Settings
                </h2>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="form-label">Default Receipt Layout</label>
                  <select
                    className="form-input form-select"
                    value={formData.receipt_default_layout}
                    onChange={e => handleChange('receipt_default_layout', e.target.value)}
                    disabled={!isOwner}
                  >
                    <option value="80mm">80mm Thermal Printer (Narrow POS roll - Recommended)</option>
                    <option value="a4">A4 Full Sheet Paper (Full Invoice with Signatures)</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="form-label">Thermal 80mm Printer</label>
                    <select
                      className="form-input form-select"
                      value={formData.printer_80mm}
                      onChange={e => handleChange('printer_80mm', e.target.value)}
                      disabled={!isOwner}
                    >
                      <option value="">Default System Printer</option>
                      {printers.map(p => (
                        <option key={p.name} value={p.name}>
                          {p.name} {p.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">A4 Sheet Printer</label>
                    <select
                      className="form-input form-select"
                      value={formData.printer_a4}
                      onChange={e => handleChange('printer_a4', e.target.value)}
                      disabled={!isOwner}
                    >
                      <option value="">Default System Printer</option>
                      {printers.map(p => (
                        <option key={p.name} value={p.name}>
                          {p.name} {p.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label">Receipt Footer Note (Urdu / اردو شرائط)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={formData.receipt_footer_ur}
                    onChange={e => handleChange('receipt_footer_ur', e.target.value)}
                    disabled={!isOwner}
                    placeholder="واپسی کی شرائط..."
                    style={{ direction: 'rtl', fontFamily: 'Noto Nastaliq Urdu, Segoe UI, sans-serif', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label className="form-label">Receipt Footer Note (English Terms)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={formData.receipt_footer_en}
                    onChange={e => handleChange('receipt_footer_en', e.target.value)}
                    disabled={!isOwner}
                    placeholder="English return terms..."
                    style={{ fontSize: 12.5 }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    id="reprint-watermark"
                    checked={formData.receipt_reprint_watermark === '1'}
                    onChange={e => handleChange('receipt_reprint_watermark', e.target.checked ? '1' : '0')}
                    disabled={!isOwner}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#7c3aed' }}
                  />
                  <label htmlFor="reprint-watermark" style={{ fontSize: 13, color: '#374151', cursor: 'pointer', fontWeight: 600 }}>
                    Dubara print par &ldquo;COPY / نقل&rdquo; stamp zahir karein
                  </label>
                </div>
              </div>
            </div>

            {/* App / Architecture Card */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  <Cpu size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#64748b' }} />
                  System &amp; Hardware Status
                </h2>
              </div>
              <div className="card-body">
                {[
                  { label: 'Active Role',       value: userRole.toUpperCase() },
                  { label: 'Installed Printers', value: `${printers.length} detected on Windows` },
                  { label: 'PDF Generation',    value: 'Native Electron printToPDF (Enabled)' },
                  { label: 'Receipt Engine',    value: 'HTML5 / CSS Paged Media + Urdu Fonts' },
                  { label: 'Database',          value: 'SQLite WAL mode (Safe atomic transactions)' },
                ].map(i => (
                  <div key={i.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12.5 }}>
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
