'use client';

import { useState, useEffect } from 'react';
import {
  Settings, Store, Printer, Check, RefreshCw,
  AlertCircle, ShieldAlert, Cpu, FileSpreadsheet, Layers, Database,
  Cloud, CloudOff, CheckCircle2, Monitor, AlertTriangle, ArrowRight,
  Key, Copy, ShieldCheck,
} from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [userRole, setUserRole] = useState('viewer');
  const [exportingAll, setExportingAll] = useState(false);
  const [exportMsg, setExportMsg]       = useState('');
  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [keyCopied, setKeyCopied]       = useState(false);

  // Sync state (Phase 13)
  const [syncInfo, setSyncInfo]                 = useState(null);
  const [syncTriggering, setSyncTriggering]     = useState(false);
  const [syncFeedback, setSyncFeedback]         = useState('');
  const [deviceConfig, setDeviceConfig]         = useState({ deviceName: '', bookingNumberStart: 412 });
  const [savingDevice, setSavingDevice]         = useState(false);
  const [deviceSaved, setDeviceSaved]           = useState(false);
  const [clashingBookings, setClashingBookings] = useState([]);

  // Migration state (Phase 11)
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationResult, setMigrationResult]   = useState(null);
  const [migrationError, setMigrationError]     = useState('');

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
      try {
        const session = await window.electronAPI?.auth.session();
        if (session?.ok) setUserRole(session.user.role);

        const [sRes, pRes, syncRes, bookingsRes] = await Promise.all([
          window.electronAPI?.settings.get(),
          window.electronAPI?.receipts.getPrinters(),
          window.electronAPI?.sync?.status?.(),
          window.electronAPI?.bookings?.list?.({ limit: 100 }),
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

        if (syncRes?.ok && syncRes.data) {
          setSyncInfo(syncRes.data);
          setDeviceConfig({
            deviceName: syncRes.data.deviceName || 'Counter 1',
            bookingNumberStart: syncRes.data.bookingNumberStart || 412,
          });
        }

        if (bookingsRes?.ok && Array.isArray(bookingsRes.data)) {
          const clashes = bookingsRes.data.filter(b => b.clash_flag === 1);
          setClashingBookings(clashes);
        }

        if (session?.ok && session.user.role === 'owner') {
          try {
            const rec = await window.electronAPI?.auth.getRecoveryKey();
            if (rec) setRecoveryInfo(rec);
          } catch {}
        }
      } catch (err) {
        setError(err.message || 'Settings load nahi ho sakeen.');
      } finally {
        setLoading(false);
      }
    }

    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, []);

  async function handleSyncNow() {
    if (syncTriggering) return;
    setSyncTriggering(true);
    setSyncFeedback('');
    try {
      const res = await window.electronAPI?.sync?.trigger?.();
      if (res?.ok) {
        setSyncFeedback(`✓ Sync mukammal! Pushed: ${res.pushed || 0}, Pulled: ${res.pulled || 0}, Clashes: ${res.clashes || 0}`);
      } else {
        setSyncFeedback(res?.message || 'Sync mukammal nahi ho saka (Offline mode).');
      }
      const st = await window.electronAPI?.sync?.status?.();
      if (st?.ok) setSyncInfo(st.data);
    } catch (err) {
      setSyncFeedback(`Sync note: ${err.message}`);
    } finally {
      setSyncTriggering(false);
    }
  }

  async function handleSaveDevice() {
    if (savingDevice || userRole !== 'owner') return;
    setSavingDevice(true);
    setDeviceSaved(false);
    try {
      const res = await window.electronAPI?.sync?.setDeviceConfig?.(deviceConfig);
      if (res?.ok) {
        setDeviceSaved(true);
        if (res.status) setSyncInfo(res.status);
        setTimeout(() => setDeviceSaved(false), 3000);
      }
    } catch (err) {
      alert(`Device config save karne mein masla aya: ${err.message}`);
    } finally {
      setSavingDevice(false);
    }
  }

  async function handleResolveClash(bookingId) {
    try {
      await window.electronAPI?.sync?.resolveClash?.(bookingId);
      const bRes = await window.electronAPI?.bookings?.list?.({ limit: 100 });
      if (bRes?.ok) {
        setClashingBookings((bRes.data || []).filter(b => b.clash_flag === 1));
      }
      const st = await window.electronAPI?.sync?.status?.();
      if (st?.ok) setSyncInfo(st.data);
    } catch (err) {
      alert(`Clash resolve note: ${err.message}`);
    }
  }

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

  async function handleMigration(isDryRun) {
    if (migrationLoading || userRole !== 'owner') return;
    setMigrationLoading(true);
    setMigrationError('');
    try {
      const fn = isDryRun
        ? window.electronAPI?.migration?.preview
        : window.electronAPI?.migration?.run;
      const res = await fn?.({});
      if (res?.ok && res.data) {
        setMigrationResult(res.data);
      } else {
        throw new Error(res?.message || 'Migration request failed.');
      }
    } catch (err) {
      setMigrationError(err.message || 'Migration execution failed.');
    } finally {
      setMigrationLoading(false);
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

            {/* Emergency Full Excel Backup Card (Owner Only) */}
            {isOwner && (
              <div className="card" style={{ border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                <div className="card-header" style={{ borderBottom: '1px solid #dcfce7' }}>
                  <h2 className="card-title" style={{ color: '#166534' }}>
                    <Layers size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#16a34a' }} />
                    Emergency Fallback (Export Everything)
                  </h2>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: 12.5, color: '#15803d', marginBottom: 12, lineHeight: 1.5 }}>
                    Pura system data (Bookings, Items, Payments, Customers, Dresses) ek hi multi-tab Excel workbook mein export karein. Emergency fallback ke liye behtareen hai.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={async () => {
                      setExportingAll(true);
                      setExportMsg('');
                      try {
                        const res = await window.electronAPI?.reports?.exportEverything({});
                        if (res?.ok && !res.canceled) {
                          setExportMsg(`✓ Saved to: ${res.filePath}`);
                        } else if (!res?.canceled && res?.message) {
                          alert(res.message);
                        }
                      } catch (err) {
                        alert(`Export failed: ${err.message}`);
                      } finally {
                        setExportingAll(false);
                      }
                    }}
                    disabled={exportingAll}
                    style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 700, width: '100%', justifyContent: 'center' }}
                  >
                    <FileSpreadsheet size={14} /> {exportingAll ? 'Exporting...' : 'Export Everything to Excel (.xlsx)'}
                  </button>
                  {exportMsg && (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: '#166534', fontWeight: 600 }}>
                      {exportMsg}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MS Access Data Migration Card (Phase 11 - Owner Only) */}
            {isOwner && (
              <div className="card" style={{ border: '1px solid #c7d2fe', background: '#f5f3ff' }}>
                <div className="card-header" style={{ borderBottom: '1px solid #e0e7ff' }}>
                  <h2 className="card-title" style={{ color: '#4338ca' }}>
                    <Database size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#6366f1' }} />
                    MS Access Data Migration (Phase 11)
                  </h2>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: 12.5, color: '#4f46e5', marginBottom: 12, lineHeight: 1.5 }}>
                    Purane Microsoft Access system (Jan–Oct 2026) ka tamam data (359 Bookings, 368 Lines, Grand Total Rs 789,801) import karein. Dry run se pehle verification hoti hai aur real run atomic transaction mein execute hota hai.
                  </p>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleMigration(true)}
                      disabled={migrationLoading}
                      style={{ flex: 1, justifyContent: 'center', fontSize: 12.5 }}
                    >
                      <RefreshCw size={13} className={migrationLoading ? 'spin' : ''} />
                      Preview (Dry Run)
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        if (confirm('Kya aap MS Access data ko live database mein import karna chahte hain?')) {
                          handleMigration(false);
                        }
                      }}
                      disabled={migrationLoading}
                      style={{ flex: 1, justifyContent: 'center', background: '#6366f1', borderColor: '#6366f1', fontSize: 12.5 }}
                    >
                      <Database size={13} />
                      Import Access Data
                    </button>
                  </div>

                  {migrationError && (
                    <div style={{ padding: 8, background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
                      <AlertCircle size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      {migrationError}
                    </div>
                  )}

                  {migrationResult && (
                    <div style={{ padding: 10, background: '#fff', border: '1px solid #e0e7ff', borderRadius: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontWeight: 700, color: migrationResult.passed ? '#15803d' : '#b45309' }}>
                        <span>{migrationResult.isDryRun ? '🔍 Dry Run Result' : '💾 Real Import Result'}</span>
                        <span>{migrationResult.passed ? '✅ PASSED' : '⚠️ WARNINGS'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', color: '#475569' }}>
                        <div>Bookings: <strong>{migrationResult.bookingsCount}</strong> (target: 359)</div>
                        <div>Line items: <strong>{migrationResult.lineItemsCount}</strong> (target: 368)</div>
                        <div>Total: <strong>Rs {Number(migrationResult.grandTotalSum).toLocaleString()}</strong></div>
                        <div>Unique customers: <strong>{migrationResult.uniqueCustomersCount}</strong></div>
                        <div>Old remaining diffs: <strong>{migrationResult.oldRemainingMismatchesCount}</strong></div>
                        <div>Skipped (existed): <strong>{migrationResult.stats?.bookingsSkipped || 0}</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Supabase Cloud & Offline Sync Card (Phase 13) */}
            <div id="sync-section" className="card" style={{ border: '1px solid #bae6fd', background: '#f0f9ff' }}>
              <div className="card-header" style={{ borderBottom: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="card-title" style={{ color: '#0369a1' }}>
                  <Cloud size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#0284c7' }} />
                  Supabase Cloud &amp; Offline Sync (Phase 13)
                </h2>
                {syncInfo && (
                  <span style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 12,
                    background: syncInfo.badgeType === 'danger' ? '#fee2e2' : syncInfo.badgeType === 'success' ? '#dcfce7' : '#fef3c7',
                    color: syncInfo.badgeType === 'danger' ? '#991b1b' : syncInfo.badgeType === 'success' ? '#166534' : '#92400e',
                  }}>
                    {syncInfo.badge}
                  </span>
                )}
              </div>
              <div className="card-body">
                <p style={{ fontSize: 12.5, color: '#0369a1', marginBottom: 14, lineHeight: 1.5 }}>
                  Boutique ka data offline mehfooz rehta hai aur internet aane par background mein Supabase cloud ke sath khud-ba-khud sync hota hai.
                </p>

                {/* Status overview */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 14, background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e0f2fe', fontSize: 12 }}>
                  <div>Device: <strong>{syncInfo?.deviceName || 'Counter 1'}</strong> ({syncInfo?.deviceId || 'pc_1'})</div>
                  <div>Starting No: <strong>#{syncInfo?.bookingNumberStart || 412}</strong></div>
                  <div>Pending Changes: <strong style={{ color: (syncInfo?.pendingCount || 0) > 0 ? '#d97706' : '#16a34a' }}>{syncInfo?.pendingCount || 0}</strong></div>
                  <div>Last Synced: <strong>{syncInfo?.lastSyncTime ? new Date(syncInfo.lastSyncTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'Not yet'}</strong></div>
                </div>

                {/* Sync Now Action */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSyncNow}
                    disabled={syncTriggering}
                    style={{ background: '#0284c7', borderColor: '#0284c7', fontWeight: 700, fontSize: 12.5, flex: 1, justifyContent: 'center' }}
                  >
                    <RefreshCw size={13} className={syncTriggering ? 'spin' : ''} />
                    {syncTriggering ? 'Syncing...' : 'Sync Now (ابھی سنک کریں)'}
                  </button>
                </div>

                {syncFeedback && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 14,
                    background: syncFeedback.startsWith('✓') ? '#dcfce7' : '#fef3c7',
                    color: syncFeedback.startsWith('✓') ? '#166534' : '#92400e',
                    fontWeight: 600,
                  }}>
                    {syncFeedback}
                  </div>
                )}

                {/* Multi-PC Configuration (Owner Only) */}
                {isOwner && (
                  <div style={{ borderTop: '1px solid #e0f2fe', paddingTop: 12, marginTop: 4 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0369a1', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Monitor size={14} /> Multi-PC Counter Configuration
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 11.5 }}>Counter Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={deviceConfig.deviceName}
                          onChange={e => setDeviceConfig(prev => ({ ...prev, deviceName: e.target.value }))}
                          placeholder="e.g. Counter 1"
                          style={{ fontSize: 12, padding: '6px 10px' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 11.5 }}>Booking No Block Start</label>
                        <input
                          type="number"
                          className="form-input"
                          value={deviceConfig.bookingNumberStart}
                          onChange={e => setDeviceConfig(prev => ({ ...prev, bookingNumberStart: e.target.value }))}
                          placeholder="412"
                          style={{ fontSize: 12, padding: '6px 10px' }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSaveDevice}
                      disabled={savingDevice}
                      style={{ fontSize: 12, width: '100%', justifyContent: 'center' }}
                    >
                      <Check size={13} /> {savingDevice ? 'Saving...' : deviceSaved ? '✓ Saved!' : 'Save Counter Settings'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Offline Booking Clash Review Card (if clashes exist) */}
            {clashingBookings.length > 0 && (
              <div className="card" style={{ border: '1px solid #fecdd3', background: '#fff1f2' }}>
                <div className="card-header" style={{ borderBottom: '1px solid #ffe4e6' }}>
                  <h2 className="card-title" style={{ color: '#9f1239' }}>
                    <AlertTriangle size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#e11d48' }} />
                    Needs a Look — Offline Booking Clashes ({clashingBookings.length})
                  </h2>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: 12, color: '#9f1239', marginBottom: 10 }}>
                    Do ya zyada counters par offline kaam ke doran same dress overlapping dates par book hui thi:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {clashingBookings.map(b => (
                      <div key={b.id} style={{
                        background: '#fff', border: '1px solid #fecdd3', borderRadius: 6,
                        padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#881337' }}>Booking #{b.booking_no} ({b.customer_name || 'Customer'})</div>
                          <div style={{ color: '#64748b', fontSize: 11 }}>Delivery: {b.delivery_date} | Return: {b.returning_date}</div>
                          {b.clash_note && <div style={{ color: '#be123c', fontSize: 11, marginTop: 2 }}>{b.clash_note}</div>}
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleResolveClash(b.id)}
                          style={{ fontSize: 11, padding: '4px 8px' }}
                        >
                          Dismiss Clash
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Owner Security & Emergency Recovery Key Card */}
            {isOwner && recoveryInfo?.recoveryKey && (
              <div className="card" style={{ border: '1px solid #ddd6fe', background: '#faf5ff' }}>
                <div className="card-header" style={{ borderBottom: '1px solid #ede9fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="card-title" style={{ color: '#6d28d9' }}>
                    <ShieldCheck size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#7c3aed' }} />
                    Emergency Master Recovery Key
                  </h2>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: 12.5, color: '#6d28d9', marginBottom: 12, lineHeight: 1.5 }}>
                    Agar aap kabhi password bhool jayein aur internet na ho, to is Master Key ke zariye login screen par password foran reset kiya ja sakta hai.
                  </p>

                  <div style={{
                    background: '#fff', border: '1px dashed #c4b5fd', borderRadius: 8,
                    padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 10,
                  }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#4c1d95', letterSpacing: 1 }}>
                      {recoveryInfo.recoveryKey}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(recoveryInfo.recoveryKey);
                        setKeyCopied(true);
                        setTimeout(() => setKeyCopied(false), 2000);
                      }}
                      className="btn btn-sm"
                      style={{
                        background: keyCopied ? '#10b981' : '#7c3aed', color: 'white',
                        border: 'none', fontSize: 11, fontWeight: 600, padding: '5px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      {keyCopied ? 'Copied!' : 'Copy Key'}
                    </button>
                  </div>

                  {recoveryInfo.email && (
                    <div style={{ fontSize: 11.5, color: '#7c3aed' }}>
                      Registered Recovery Email: <strong>{recoveryInfo.email}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

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
