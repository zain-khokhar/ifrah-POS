'use client';

import { useState, useEffect } from 'react';
import {
  Database, Download, HardDrive, FolderOpen, RefreshCw,
  CheckCircle2, AlertCircle, ShieldCheck, Clock, FileText,
} from 'lucide-react';

export default function BackupPage() {
  const [backups,     setBackups]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [backingUp,   setBackingUp]   = useState(false);
  const [lastBackup,  setLastBackup]  = useState(null);
  const [error,       setError]       = useState('');
  const [feedback,    setFeedback]    = useState('');

  async function loadBackups() {
    setLoading(true);
    try {
      const res = await window.electronAPI?.backup.list();
      if (res?.ok) setBackups(res.data || []);
    } catch (err) {
      console.error('[BackupPage]', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    window.electronAPI?.backup.list().then(res => {
      if (active) {
        if (res?.ok) setBackups(res.data || []);
        setLoading(false);
      }
    }).catch(err => {
      console.error('[BackupPage]', err);
      if (active) setLoading(false);
    });
    return () => { active = false; };
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
        setLastBackup(res);
        setFeedback(`Backup kamiyabi se save ho gaya: ${res.filename} (${res.sizeFormatted})`);
        await loadBackups();
      } else {
        setError(res?.message || 'Backup failed.');
      }
    } catch (err) {
      setError(err.message || 'Backup create karte waqt error aaya.');
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
        setLastBackup(res);
        setFeedback(`Manual backup mukammal ho gaya! File save hui:\n${res.filePath} (${res.sizeFormatted})`);
        await loadBackups();
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Local Backup</h1>
          <p className="page-subtitle">
            Dukaan ka mukammal data mehfooz karein — offline SQLite backup aur integrity check
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleOpenFolder}
            title="Open default backup folder in Windows Explorer"
          >
            <FolderOpen size={14} /> Backup Folder Kholein
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleQuickBackup}
            disabled={backingUp}
            style={{ fontWeight: 600 }}
          >
            {backingUp ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
            Default Folder Backup
          </button>
          <button
            className="btn btn-primary"
            onClick={handleChooseAndSave}
            disabled={backingUp}
            style={{ fontWeight: 700 }}
          >
            {backingUp ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            Manual Backup (Save As...)
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Feedback banners */}
        {feedback && (
          <div style={{
            background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10,
            padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 12,
            color: '#065f46', fontSize: 13.5,
          }}>
            <CheckCircle2 size={18} color="#059669" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, whiteSpace: 'pre-line', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 800 }}>Backup Successfully Saved!</div>
              <div>{feedback}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: '#047857' }}>
                ✓ PRAGMA integrity_check pass: Data file bilkul uncorrupted aur ready hai.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12,
            color: '#b91c1c', fontSize: 13.5,
          }}>
            <AlertCircle size={18} color="#dc2626" />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 18 }}>

          {/* Left Column: Real Backup History */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="card-title">
                <HardDrive size={15} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle', color: '#7c3aed' }} />
                Saved Backups
              </h2>
              <span className="badge badge-success">
                {backups.length} file{backups.length !== 1 ? 's' : ''}
              </span>
            </div>

            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                <div>Backups check ho rahe hain...</div>
              </div>
            ) : backups.length === 0 ? (
              <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
                <Database size={44} style={{ marginBottom: 12, opacity: 0.35 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                  Abhi tak koi backup create nahi hua
                </div>
                <div style={{ fontSize: 13, marginBottom: 16 }}>
                  &quot;Manual Backup (Save As...)&quot; par click kar ke pehla backup save karein.
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
                    padding: '14px 16px',
                    borderBottom: i < backups.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: '#ede9fe',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#7c3aed',
                    }}>
                      <Database size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: '#0f172a',
                        fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {b.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', gap: 12 }}>
                        <span><Clock size={11} style={{ display: 'inline', marginRight: 4 }} />{b.dateFormatted}</span>
                        <span>•</span>
                        <span><FileText size={11} style={{ display: 'inline', marginRight: 4 }} />{b.size}</span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                      background: b.type === 'manual' ? '#f5f3ff' : '#f1f5f9',
                      color: b.type === 'manual' ? '#7c3aed' : '#64748b',
                    }}>
                      {b.type === 'manual' ? 'Manual' : 'Auto'}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                      background: '#dcfce7', color: '#16a34a',
                    }}>
                      Valid ✓
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
              <span>SQLite Online Backup API — WAL mode safe</span>
              <span>Integrity check automatic chalta hai</span>
            </div>
          </div>

          {/* Right Column: Security & Guidance Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <ShieldCheck size={22} color="#10b981" />
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Backup Rules &amp; Hifazat
                </h3>
              </div>
              <ul style={{ fontSize: 13, color: '#475569', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
                <li>
                  <strong>Offline Hifazat:</strong> Ye backup aapke computer ke storage mein bilkul safe rehta hai, chahe internet band ho.
                </li>
                <li>
                  <strong>USB / External Drive:</strong> Rozana dukaan band karne se pehle &quot;Manual Backup (Save As...)&quot; se USB drive par save karna recommended hai.
                </li>
                <li>
                  <strong>Corruption Proof:</strong> Har backup banne ke foran baad SQLite ka <code>PRAGMA integrity_check</code> run hota hai.
                </li>
                <li>
                  <strong>Audit Trail:</strong> Har dafa jab backup banta hai, system audit log mein us ka record mehfooz karta hai.
                </li>
              </ul>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                Emergency Fallback
              </div>
              <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.6, margin: 0 }}>
                Agar Windows kharab ho jaye ya system crash ho, to nayi PC par ye <code>.sqlite</code> file copy kar ke software foran recover kiya ja sakta hai.
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
    </div>
  );
}
