'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, Key, Copy, Check, AlertTriangle, RefreshCw, Lock, CheckCircle2, Phone } from 'lucide-react';

export default function ActivationModal({ isOpen, onActivated }) {
  const [machineCode, setMachineCode] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined' && window.electronAPI?.license) {
      window.electronAPI.license.getMachineCode().then(res => {
        if (res?.machineCode) setMachineCode(res.machineCode);
      }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyMachineCode = () => {
    if (!machineCode) return;
    navigator.clipboard?.writeText(machineCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const cleanKey = licenseKey.trim().toUpperCase();
    if (!cleanKey) {
      setError('Apni License Key enter karein.');
      return;
    }
    setLoading(true);
    try {
      const res = await window.electronAPI?.license?.activate(cleanKey);
      if (res?.ok) {
        setSuccess(`Kamyabi! Software "${res.clientName || 'Ifrah Collection'}" ke liye activate ho gaya.`);
        setTimeout(() => { if (onActivated) onActivated(res); }, 1200);
      } else {
        setError(res?.message || 'Activation nakaam. Key ya internet connection check karein.');
      }
    } catch {
      setError('Activation ke doran masla pesh aya. Dobara koshish karein.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10, 8, 20, 0.95)',
      backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: 20,
    }}>
      <div style={{
        background: '#ffffff', borderRadius: 18, maxWidth: 480, width: '100%',
        boxShadow: '0 32px 64px -12px rgba(0,0,0,0.5)',
        border: '1px solid #e2e8f0', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 60%, #7c3aed 100%)',
          color: '#fff', padding: '28px 28px 22px', textAlign: 'center',
        }}>
          <div style={{
            width: 58, height: 58, borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 0 0 8px rgba(255,255,255,0.06)',
          }}>
            <ShieldCheck size={30} />
          </div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Software Activation Required
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, opacity: 0.8 }}>
            Ifrah Collection POS — Hardware-Bound License
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 26px 20px' }}>

          {/* Machine Code Box */}
          <div style={{
            background: '#f8fafc', border: '1.5px solid #e2e8f0',
            borderRadius: 10, padding: '12px 14px', marginBottom: 18,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Is Computer Ka Machine Code (Admin ko bhejein):
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#1e1b4b', letterSpacing: '0.04em' }}>
                {machineCode || 'Loading...'}
              </span>
              <button type="button" onClick={copyMachineCode} style={{
                background: copied ? '#dcfce7' : '#ede9fe', border: 'none',
                borderRadius: 6, padding: '5px 11px', fontSize: 11.5, fontWeight: 700,
                color: copied ? '#15803d' : '#6d28d9', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleActivate}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              License Key Darj Karein:
            </label>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Key size={15} style={{ position: 'absolute', left: 12, top: 11, color: '#94a3b8' }} />
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="IFRAH-XXXX-XXXX-XXXX"
                disabled={loading || Boolean(success)}
                style={{
                  width: '100%', padding: '10px 14px 10px 36px',
                  borderRadius: 8, border: '1.5px solid #cbd5e1',
                  fontSize: 13.5, fontFamily: 'monospace', fontWeight: 700,
                  letterSpacing: '0.05em', boxSizing: 'border-box', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#6d28d9'}
                onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                required
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '9px 13px', fontSize: 12, color: '#991b1b',
                display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12,
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>{error}</div>
              </div>
            )}

            {success && (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                padding: '9px 13px', fontSize: 12, color: '#15803d',
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                <div>{success}</div>
              </div>
            )}

            <button type="submit" disabled={loading || Boolean(success)} style={{
              width: '100%', padding: '12px 16px',
              background: (loading || success) ? '#a5b4fc' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              border: 'none', borderRadius: 8, color: '#fff',
              fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 14px rgba(79,70,229,0.3)',
              transition: 'background 0.2s',
            }}>
              {loading ? (
                <><RefreshCw size={15} className="spin" /> Verification jari hai...</>
              ) : (
                <><Lock size={14} /> Activate Karein</>
              )}
            </button>
          </form>

          {/* Contact Section */}
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: '#f8fafc', borderRadius: 10,
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              License Key Hasil Karne Ke Liye Admin Se Rabta Karein:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={14} style={{ color: '#6d28d9', flexShrink: 0 }} />
              <span style={{ fontWeight: 800, fontSize: 15, color: '#1e1b4b', letterSpacing: '0.02em' }}>
                0301-6135391
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              WhatsApp ya call — apna Machine Code bhejein, License Key milegi.
            </div>
          </div>

          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
            🔒 Pehli dafa activation ke liye internet chahiye. Baad mein 100% offline chalega.
          </div>
        </div>
      </div>
    </div>
  );
}
