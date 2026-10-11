'use strict';
'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, Key, Copy, Check, AlertTriangle, RefreshCw, Lock, Sparkles, CheckCircle2 } from 'lucide-react';

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
      setError('Barah-e-karam apni License Key enter karein.');
      return;
    }

    setLoading(true);
    try {
      const res = await window.electronAPI?.license?.activate(cleanKey);
      if (res?.ok) {
        setSuccess(`Kamyabi! Software "${res.clientName || 'Ifrah Boutique'}" ke liye activate ho gaya hai.`);
        setTimeout(() => {
          if (onActivated) onActivated(res);
        }, 1200);
      } else {
        setError(res?.message || 'Activation nakaam ho gayi. Key ya internet check karein.');
      }
    } catch (err) {
      setError('Activation ke doran masla pesh aya. Dobara koshish karein.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 14, 26, 0.92)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: 20,
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        maxWidth: 500,
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          color: '#ffffff',
          padding: '24px 28px',
          textAlign: 'center',
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <ShieldCheck size={32} style={{ color: '#ffffff' }} />
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Software Security Activation</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.9 }}>
            Machine Registration & License Verification
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px' }}>
          {/* Machine Code Box */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Is Computer Ka Unique Machine Code:
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 6,
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                {machineCode || 'HWID-FETCHING...'}
              </span>
              <button
                type="button"
                onClick={copyMachineCode}
                style={{
                  background: copied ? '#dcfce7' : '#ede9fe',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: copied ? '#15803d' : '#6d28d9',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Ye software is specific hardware ke sath bind hoga.
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleActivate}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                License Key Darj Karein:
              </label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                  placeholder="IFRAH-XXXX-YYYY"
                  disabled={loading || Boolean(success)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 38px',
                    borderRadius: 8,
                    border: '1.5px solid #cbd5e1',
                    fontSize: 14,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  required
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12.5,
                color: '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <div>{error}</div>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div style={{
                background: '#dcfce7',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 12.5,
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <div>{success}</div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || Boolean(success)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                border: 'none',
                borderRadius: 8,
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  Cloud Verification In Progress...
                </>
              ) : (
                <>
                  <Lock size={15} />
                  Activate Software (آن لائن تصدیق)
                </>
              )}
            </button>
          </form>

          {/* Footer Note */}
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11.5, color: '#64748b' }}>
            🔒 Pehli dafa activation ke liye sirf 5 second internet darkaar hai. Iske baad software 100% offline chalega.
          </div>
        </div>
      </div>
    </div>
  );
}
