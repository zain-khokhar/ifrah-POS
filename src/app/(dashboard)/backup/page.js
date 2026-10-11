'use strict';
'use client';

import { useState, useEffect } from 'react';
import {
  Database, Download, HardDrive, FolderOpen, RefreshCw,
  CheckCircle2, AlertCircle, ShieldCheck, Clock, FileText,
  Archive, RotateCcw, Eye, X, AlertTriangle, ShieldAlert
} from 'lucide-react';

export default function BackupPage() {
  const [backups,       setBackups]       = useState([]);
  const [statusInfo,    setStatusInfo]    = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [backingUp,     setBackingUp]     = useState(false);
  const [userRole,      setUserRole]      = useState('viewer');
  const [error,         setError]         = useState('');
  const [feedback,      setFeedback]      = useState('');

  // Inspect Modal state
  const [inspectModal,  setInspectModal]  = useState(null); // backup object
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectData,   setInspectData]   = useState(null);
  const [inspectError,  setInspectError]  = useState('');

  // Restore Modal state (Owner Only)
  const [restoreModal,  setRestoreModal]  = useState(null); // backup object
  const [restoring,     setRestoring]     = useState(false);
  const [restoreError,  setRestoreError]  = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState(null);

  async function loadData() {
    try {
      const [sessionRes, listRes, statusRes] = await Promise.all([
        window.electronAPI?.auth?.session(),
        window.electronAPI?.backup?.list(),
        window.electronAPI?.backup?.status(),
      ]);

      if (sessionRes?.ok && sessionRes.user) {
        setUserRole(sessionRes.user.role);
      }

      if (listRes?.ok) {
        setBackups(listRes.data || []);
      }

      if (statusRes?.ok) {
        setStatusInfo(statusRes);
      }
    } catch (err) {
      console.error('[BackupPage]', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, []);

  // Quick backup to default app folder
  async function handleQuickBackup() {
    if (backingUp) return;
    setBackingUp(true);
    setError('');
    setFeedback('');

    try {
      const res = await window.electronAPI?.backup.create({ isManual: true });
      if (res?.ok) {
        setFeedback(`Backup kamiyabi se save ho gaya: ${res.filename} (${res.sizeFormatted})`);
        await loadData();
      } else {
        setError(res?.message || 'Backup failed.');
      }
    } catch (err) {
      setError(err.message || 'Backup create karte waqt error aaya.');
    } finally {
      setBackingUp(false);
    }
  }

  // Full archive backup (.zip with photos)
  async function handleArchiveBackup() {
    if (backingUp) return;
    setBackingUp(true);
    setError('');
    setFeedback('');

    try {
      const res = await window.electronAPI?.backup.createArchive({});
      if (res?.ok) {
        setFeedback(`Full ZIP Archive (Database + Photos) save ho gaya:\n${res.filename} (${res.sizeFormatted})`);
        await loadData();
      } else {
        setError(res?.message || 'Archive backup failed.');
      }
    } catch (err) {
      setError(err.message || 'Archive create karte waqt error aaya.');
    } finally {
      setBackingUp(false);
    }
  }

  // Interactive Save Dialog: Choose USB or any folder
  async function handleChooseAndSave() {
    if (backingUp) return;
    setBackingUp(true);
    setError('');
    setFeedback('');

    try {
      const res = await window.electronAPI?.backup.chooseAndSave();
      if (res?.ok) {
        setFeedback(`Manual backup save ho gaya:\n${res.filePath} (${res.sizeFormatted})`);
        await loadData();
      } else if (!res?.canceled) {
        setError(res?.message || 'Save failed.');
      }
    } catch (err) {
      setError(err.message || 'File save dialog mein error aaya.');
    } finally {
      setBackingUp(false);
    }
  }

  // Open default backup folder in Explorer
  async function handleOpenFolder() {
    try {
      await window.electronAPI?.backup.openFolder();
    } catch (err) {
      alert('Folder open karne mein masla aaya: ' + err.message);
    }
  }

  // Inspect a backup
  async function handleInspect(backupItem) {
    setInspectModal(backupItem);
    setInspectLoading(true);
    setInspectData(null);
    setInspectError('');

    try {
      const res = await window.electronAPI?.backup.inspect(backupItem.path);
      if (res?.ok && res.valid) {
        setInspectData(res.summary);
      } else {
        setInspectError(res?.error || 'Backup file corrupt ya unreadable hai.');
      }
    } catch (err) {
      setInspectError(err.message || 'Inspection failed.');
    } finally {
      setInspectLoading(false);
    }
  }

  // Open restore modal
  async function handleOpenRestore(backupItem) {
    setRestoreModal(backupItem);
    setRestoreError('');
    setRestoreSuccess(null);
    setInspectLoading(true);
    setInspectData(null);

    try {
      const res = await window.electronAPI?.backup.inspect(backupItem.path);
      if (res?.ok && res.valid) {
        setInspectData(res.summary);
      } else {
        setRestoreError(res?.error || 'Backup file corrupt hai, restore nahi kiya ja sakta.');
      }
    } catch (err) {
      setRestoreError(err.message);
    } finally {
      setInspectLoading(false);
    }
  }

  // Execute restore
  async function handleConfirmRestore() {
    if (!restoreModal || restoring || userRole !== 'owner') return;
    setRestoring(true);
    setRestoreError('');

    try {
      const res = await window.electronAPI?.backup.restore({
        backupFilePath: restoreModal.path,
        restartAfter: false,
      });

      if (res?.ok) {
        setRestoreSuccess(res);
        setFeedback(`Database kamiyabi se restore ho gaya!\nSafety backup save hua: ${res.safetySnapshot}`);
        await loadData();
      } else {
        throw new Error(res?.message || 'Restore failed.');
      }
    } catch (err) {
      setRestoreError(err.message || 'Restore execution failed.');
    } finally {
      setRestoring(false);
    }
  }

  const isOwner = userRole === 'owner';

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Backup &amp; Restore</h1>
          <p className="page-subtitle">
            Dukaan ka mukammal data mehfooz karein — automatic daily snapshots, integrity verification aur 1-click restore
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleOpenFolder}
            title="Open backup folder in Windows Explorer"
          >
            <FolderOpen size={14} /> Folder Kholein
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleQuickBackup}
            disabled={backingUp}
            style={{ fontWeight: 600 }}
          >
            {backingUp ? <RefreshCw size={14} className="spin" /> : <Database size={14} />}
            Default Backup
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleArchiveBackup}
            disabled={backingUp}
            style={{ fontWeight: 600, color: '#4f46e5', borderColor: '#c7d2fe', background: '#f5f3ff' }}
            title="Full archive backup bundling SQLite DB + all dress photos into a .zip"
          >
            {backingUp ? <RefreshCw size={14} className="spin" /> : <Archive size={14} />}
            Full ZIP Archive (+Photos)
          </button>
          <button
            className="btn btn-primary"
            onClick={handleChooseAndSave}
            disabled={backingUp}
            style={{ fontWeight: 700 }}
          >
            {backingUp ? <RefreshCw size={14} className="spin" /> : <Download size={14} />}
            Manual Save As (USB)...
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* ── Live Backup Health Overview Banner ─────────────────── */}
        {statusInfo && (
          <div style={{
            background: statusInfo.warning ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${statusInfo.warning ? '#fecaca' : '#bbf7d0'}`,
            borderRadius: 10,
            padding: '12px 18px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 13,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {statusInfo.warning ? (
                <AlertTriangle size={20} color="#dc2626" />
              ) : (
                <ShieldCheck size={20} color="#16a34a" />
              )}
              <div>
                <div style={{ fontWeight: 700, color: statusInfo.warning ? '#991b1b' : '#166534' }}>
                  {statusInfo.message}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                  Retention Policy: 30 daily backups mehfooz rehte hain + monthly snapshots. PRAGMA integrity_check har backup par automatic chalta hai.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge" style={{
                background: statusInfo.warning ? '#fee2e2' : '#dcfce7',
                color: statusInfo.warning ? '#b91c1c' : '#15803d',
                fontWeight: 700,
              }}>
                {statusInfo.warning ? 'ACTION REQUIRED' : 'HEALTHY ✓'}
              </span>
            </div>
          </div>
        )}

        {/* Feedback banners */}
        {feedback && (
          <div style={{
            background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10,
            padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 12,
            color: '#065f46', fontSize: 13.5,
          }}>
            <CheckCircle2 size={18} color="#059669" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 800 }}>Operation Successful!</div>
              <div>{feedback}</div>
            </div>
            <button onClick={() => setFeedback('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}>
              <X size={16} />
            </button>
          </div>
        )}

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12,
            color: '#b91c1c', fontSize: 13.5,
          }}>
            <AlertCircle size={18} color="#dc2626" />
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>
              <X size={16} />
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: 18 }}>

          {/* Left Column: Real Backup History */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="card-title">
                <HardDrive size={15} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle', color: '#7c3aed' }} />
                Saved Backups &amp; Snapshots
              </h2>
              <span className="badge badge-success">
                {backups.length} file{backups.length !== 1 ? 's' : ''}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: 8 }} />
                <div>Backups check ho rahe hain...</div>
              </div>
            ) : backups.length === 0 ? (
              <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
                <Database size={44} style={{ marginBottom: 12, opacity: 0.35 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                  Abhi tak koi backup create nahi hua
                </div>
                <div style={{ fontSize: 13, marginBottom: 16 }}>
                  &quot;Manual Save As (USB)...&quot; par click kar ke pehla backup mehfooz karein.
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleChooseAndSave} style={{ display: 'inline-flex' }}>
                  <Download size={13} /> Pehla Backup Banayein
                </button>
              </div>
            ) : (
              <div>
                {backups.map((b, i) => (
                  <div key={b.name || i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 16px',
                    borderBottom: i < backups.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                      background: b.isZip ? '#e0e7ff' : (b.type === 'safety' ? '#fef3c7' : '#ede9fe'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: b.isZip ? '#4338ca' : (b.type === 'safety' ? '#d97706' : '#7c3aed'),
                    }}>
                      {b.isZip ? <Archive size={17} /> : <Database size={17} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: 700, color: '#0f172a',
                        fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {b.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, display: 'flex', gap: 8 }}>
                        <span><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{b.timeAgo || b.dateFormatted}</span>
                        <span>•</span>
                        <span><FileText size={11} style={{ display: 'inline', marginRight: 3 }} />{b.size}</span>
                      </div>
                    </div>

                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                      background: b.type === 'manual' ? '#f5f3ff' : (b.type === 'safety' ? '#fef3c7' : '#f1f5f9'),
                      color: b.type === 'manual' ? '#7c3aed' : (b.type === 'safety' ? '#b45309' : '#64748b'),
                    }}>
                      {b.type.toUpperCase()}
                    </span>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleInspect(b)}
                        title="Inspect backup details"
                        style={{ padding: '4px 8px', fontSize: 11.5 }}
                      >
                        <Eye size={12} /> Inspect
                      </button>

                      {isOwner && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => handleOpenRestore(b)}
                          title="Restore this backup (Owner only)"
                          style={{
                            padding: '4px 8px', fontSize: 11.5,
                            background: '#fee2e2', color: '#dc2626', borderColor: '#fecaca', fontWeight: 700,
                          }}
                        >
                          <RotateCcw size={12} /> Restore
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
              <span>SQLite Online Backup API — Safe concurrent WAL snapshot</span>
              <span>Integrity check automatic chalta hai</span>
            </div>
          </div>

          {/* Right Column: Security & Guidance Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <ShieldCheck size={22} color="#10b981" />
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Phase 12 Data Protection
                </h3>
              </div>
              <ul style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
                <li>
                  <strong>Rozana Automatic Backup:</strong> App khulte waqt agar aaj backup nahi hua, to system khud ba khud background mein backup bana leta hai.
                </li>
                <li>
                  <strong>2-Day Safety Warning:</strong> Agar 2 din tak koi backup na ho, to Dashboard aur is screen par alert warning aati hai.
                </li>
                <li>
                  <strong>Full Archive (.zip):</strong> SQLite database ke sath photos folder ko ek hi zip archive mein bundle karta hai.
                </li>
                <li>
                  <strong>Corruption-Proof Restore:</strong> Restore se pehle mojooda live database ka <code>before-restore</code> safety snapshot banta hai. Agar koi masla aaye to foran rollback ho jata hai.
                </li>
              </ul>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                Emergency USB Recommendation
              </div>
              <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.6, margin: 0 }}>
                Rozana dukaan band karte waqt &quot;Manual Save As (USB)...&quot; button se USB flash drive ya external hard drive par backup save karein taake PC hardware damage hone ki surat mein bhi data mehfooz rahe.
              </p>
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleOpenFolder} style={{ width: '100%' }}>
                  <FolderOpen size={13} /> Backup Folder Explorer Mein Kholein
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Inspect Backup Modal ─────────────────────────────────────── */}
      {inspectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(3px)', padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 480, width: '100%', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                <Eye size={18} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', color: '#6366f1' }} />
                Backup Details &amp; Summary
              </h3>
              <button onClick={() => setInspectModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace', marginBottom: 14, wordBreak: 'break-all' }}>
              {inspectModal.name}
            </div>

            {inspectLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={22} className="spin" style={{ marginBottom: 8 }} />
                <div>Checking backup file integrity...</div>
              </div>
            ) : inspectError ? (
              <div style={{ padding: 12, background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 12.5 }}>
                <AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                {inspectError}
              </div>
            ) : inspectData ? (
              <div>
                <div style={{
                  padding: 10, background: '#ecfdf5', border: '1px solid #a7f3d0',
                  borderRadius: 8, fontSize: 12, color: '#065f46', fontWeight: 600, marginBottom: 14,
                }}>
                  ✓ PRAGMA integrity_check passed — Database is fully healthy and valid.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                  <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ color: '#64748b', fontSize: 11 }}>Bookings Count</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{inspectData.bookingsCount}</div>
                  </div>
                  <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ color: '#64748b', fontSize: 11 }}>Customers Count</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{inspectData.customersCount}</div>
                  </div>
                  <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ color: '#64748b', fontSize: 11 }}>Dresses in Catalog</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{inspectData.dressesCount}</div>
                  </div>
                  <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ color: '#64748b', fontSize: 11 }}>Payments Total</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Rs {Number(inspectData.paymentsSum).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setInspectModal(null)}>
                Band Karein
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── One-Click Restore Modal (Owner Only) ────────────────────── */}
      {restoreModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)', padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 520, width: '100%', padding: 24, border: '2px solid #f87171' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#b91c1c', margin: 0 }}>
                <ShieldAlert size={20} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                Restore Database Confirmation
              </h3>
              <button
                onClick={() => setRestoreModal(null)}
                disabled={restoring}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, marginBottom: 14 }}>
              Aap is backup ko live system par restore karne lage hain:
            </p>

            <div style={{
              background: '#f8fafc', padding: '10px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0', marginBottom: 14, fontSize: 12.5,
            }}>
              <div>File: <strong style={{ fontFamily: 'monospace' }}>{restoreModal.name}</strong></div>
              <div>Date: <strong>{restoreModal.dateFormatted}</strong> ({restoreModal.timeAgo})</div>
              <div>Size: <strong>{restoreModal.size}</strong></div>
              {inspectData && (
                <div style={{ marginTop: 6, color: '#047857', fontWeight: 700 }}>
                  Summary: {inspectData.bookingsCount} bookings, {inspectData.customersCount} customers, {inspectData.dressesCount} dresses
                </div>
              )}
            </div>

            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
              padding: 12, fontSize: 12.5, color: '#92400e', marginBottom: 16, lineHeight: 1.5,
            }}>
              <strong>Hifazati Iqdam (Safety First):</strong><br />
              Restore hone se pehle system mojooda live database ka ek <strong>&ldquo;before-restore&rdquo;</strong> snapshot khud ba khud mehfooz karega taake mojooda data ka koi qatra zaya na ho.
            </div>

            {restoreError && (
              <div style={{ padding: 10, background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
                <AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                {restoreError}
              </div>
            )}

            {restoreSuccess && (
              <div style={{ padding: 10, background: '#ecfdf5', color: '#065f46', borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
                <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 4 }} />
                Database kamiyabi se restore ho gaya! Safety snapshot: {restoreSuccess.safetySnapshot}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRestoreModal(null)}
                disabled={restoring}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmRestore}
                disabled={restoring || !!restoreSuccess}
                style={{ background: '#dc2626', borderColor: '#dc2626', fontWeight: 800 }}
              >
                {restoring ? <RefreshCw size={14} className="spin" /> : <RotateCcw size={14} />}
                {restoring ? 'Restoring Database...' : 'Haan, Restore Karein'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
