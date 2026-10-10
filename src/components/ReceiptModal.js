'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Printer, FileText, Download, X, Check,
  RefreshCw, AlertCircle, Copy, Sliders
} from 'lucide-react';

export default function ReceiptModal({ bookingId, isOpen, onClose, onPrintComplete }) {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [data, setData]             = useState(null);
  const [layout, setLayout]         = useState('80mm'); // '80mm' | 'a4'
  const [printers, setPrinters]     = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [copies, setCopies]         = useState(1);
  const [isCopy, setIsCopy]         = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [printing, setPrinting]     = useState(false);
  const [savingPdf, setSavingPdf]   = useState(false);
  const [statusMsg, setStatusMsg]   = useState('');
  const iframeRef = useRef(null);

  // Load booking data & printers when opened
  useEffect(() => {
    if (!isOpen || !bookingId) return;

    let mounted = true;
    async function loadData() {
      setLoading(true);
      setError('');
      setStatusMsg('');
      try {
        const res = await window.electronAPI?.receipts.getData(bookingId);
        if (!res?.ok || !res.booking) {
          throw new Error(res?.message || 'Booking data nahi mil saki.');
        }

        if (mounted) {
          setData(res);
          const prefLayout = res.settings?.receipt_default_layout || '80mm';
          setLayout(prefLayout);
          setIsCopy(Boolean(res.isReprint));

          // Fetch printers
          const pRes = await window.electronAPI?.receipts.getPrinters();
          if (pRes?.ok && Array.isArray(pRes.data)) {
            setPrinters(pRes.data);
            const savedDefault = prefLayout === 'a4' ? res.settings?.printer_a4 : res.settings?.printer_80mm;
            const defaultSys = pRes.data.find(p => p.isDefault)?.name;
            setSelectedPrinter(savedDefault || defaultSys || '');
          }
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load receipt.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => { mounted = false; };
  }, [isOpen, bookingId]);

  // Generate HTML preview whenever layout or isCopy changes
  useEffect(() => {
    if (!isOpen || !bookingId || loading) return;

    let active = true;
    async function updatePreview() {
      try {
        const res = await window.electronAPI?.receipts.generateHtml({
          bookingId,
          layout,
          isCopy,
        });
        if (active && res?.ok) {
          setHtmlContent(res.html);
        }
      } catch (err) {
        console.error('Preview generation failed:', err);
      }
    }

    updatePreview();
    return () => { active = false; };
  }, [isOpen, bookingId, layout, isCopy, loading]);

  // Handle printer preference switch when layout toggles
  function handleLayoutToggle(newLayout) {
    setLayout(newLayout);
    if (data?.settings) {
      const saved = newLayout === 'a4' ? data.settings.printer_a4 : data.settings.printer_80mm;
      if (saved) setSelectedPrinter(saved);
    }
  }

  // Direct Print via Electron
  async function handlePrintDirect() {
    if (printing || !bookingId) return;
    setPrinting(true);
    setStatusMsg('');
    setError('');

    try {
      const res = await window.electronAPI?.receipts.print({
        bookingId,
        layout,
        printerName: selectedPrinter,
        copies: Number(copies) || 1,
        isCopy,
      });

      if (res?.ok) {
        setStatusMsg('Receipt kamyabi se print ho gayi!');
        setIsCopy(true); // subsequent prints are duplicates
        if (onPrintComplete) onPrintComplete();
      } else {
        throw new Error(res?.message || 'Printing failed.');
      }
    } catch (err) {
      setError(err.message || 'Printer se rabta nahi ho saka.');
    } finally {
      setPrinting(false);
    }
  }

  // Save as PDF
  async function handleSavePdf() {
    if (savingPdf || !bookingId) return;
    setSavingPdf(true);
    setStatusMsg('');
    setError('');

    try {
      const res = await window.electronAPI?.receipts.savePdf({
        bookingId,
        layout,
        isCopy,
      });

      if (res?.ok) {
        setStatusMsg(`PDF Mehfooz ho gaya: ${res.filePath}`);
        setIsCopy(true);
        if (onPrintComplete) onPrintComplete();
      } else if (!res?.canceled) {
        throw new Error(res?.message || 'PDF export failed.');
      }
    } catch (err) {
      setError(err.message || 'PDF save nahi ho saka.');
    } finally {
      setSavingPdf(false);
    }
  }

  // Browser Print Fallback
  function handleSystemPrintDialog() {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    }
  }

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1050,
      background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#ffffff', borderRadius: 16,
        width: '100%', maxWidth: 1040, maxHeight: '94vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.2)',
      }}>

        {/* Modal Top Bar */}
        <div style={{
          padding: '16px 24px', background: '#0f172a', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Printer size={18} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                Receipt Preview &amp; Print
                {data?.booking?.booking_no && (
                  <span style={{
                    fontSize: 12, background: 'rgba(124, 58, 237, 0.4)',
                    color: '#c4b5fd', padding: '2px 8px', borderRadius: 6,
                    fontFamily: 'monospace', fontWeight: 700,
                  }}>
                    #{data.booking.booking_no}
                  </span>
                )}
                {isCopy && (
                  <span style={{
                    fontSize: 11, background: '#ef4444', color: 'white',
                    padding: '2px 7px', borderRadius: 6, fontWeight: 800,
                  }}>
                    COPY / نقل
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Customer: <strong>{data?.booking?.customer_name || 'Walk-in'}</strong> ({data?.booking?.customer_phone || '-'})
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none',
              color: '#cbd5e1', borderRadius: 8, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Main Content (Controls Sidebar + Preview Area) */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, minHeight: 0 }}>

          {/* Left Column: Controls & Hardware Options */}
          <div style={{
            background: '#f8fafc', borderRight: '1px solid #e2e8f0',
            padding: '20px', display: 'flex', flexDirection: 'column', gap: 16,
            overflowY: 'auto',
          }}>

            {/* Layout Toggle */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                Paper Format / Layout
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleLayoutToggle('80mm')}
                  style={{
                    padding: '10px 8px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                    border: layout === '80mm' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                    background: layout === '80mm' ? '#ede9fe' : 'white',
                    color: layout === '80mm' ? '#5b21b6' : '#475569',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800 }}>80mm POS</div>
                  <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>Thermal Roll</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleLayoutToggle('a4')}
                  style={{
                    padding: '10px 8px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                    border: layout === 'a4' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                    background: layout === 'a4' ? '#ede9fe' : 'white',
                    color: layout === 'a4' ? '#5b21b6' : '#475569',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800 }}>A4 Sheet</div>
                  <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>Full Invoice</div>
                </button>
              </div>
            </div>

            {/* Printer Selection */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Printer
              </label>
              <select
                className="form-input form-select"
                value={selectedPrinter}
                onChange={e => setSelectedPrinter(e.target.value)}
                style={{ fontSize: 12.5 }}
              >
                <option value="">Default / System Printer</option>
                {printers.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
              {printers.length === 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  No installed printers detected. Will use system dialog or PDF.
                </div>
              )}
            </div>

            {/* Copies */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                Copies
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={copies}
                onChange={e => setCopies(Math.max(1, parseInt(e.target.value || 1, 10)))}
                className="form-input"
                style={{ fontSize: 13, fontWeight: 700, width: '100%' }}
              />
            </div>

            {/* Reprint / Duplicate Stamp Option */}
            <div style={{
              background: '#f1f5f9', borderRadius: 8, padding: '10px 12px',
              border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <input
                type="checkbox"
                id="is-copy-check"
                checked={isCopy}
                onChange={e => setIsCopy(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#7c3aed' }}
              />
              <label htmlFor="is-copy-check" style={{ fontSize: 12.5, color: '#334155', cursor: 'pointer', fontWeight: 600 }}>
                Mark as &ldquo;Duplicate / نقل&rdquo;
              </label>
            </div>

            {/* Status & Error Alerts */}
            {statusMsg && (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                padding: '10px 12px', color: '#166534', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <Check size={16} />
                <span>{statusMsg}</span>
              </div>
            )}

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 12px', color: '#991b1b', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
              <button
                type="button"
                onClick={handlePrintDirect}
                disabled={printing || loading}
                className="btn btn-primary"
                style={{
                  padding: '12px', fontSize: 14, fontWeight: 800,
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
                  boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                }}
              >
                {printing ? (
                  <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Printing...</>
                ) : (
                  <><Printer size={16} /> Print Receipt Now</>
                )}
              </button>

              <button
                type="button"
                onClick={handleSavePdf}
                disabled={savingPdf || loading}
                className="btn btn-secondary"
                style={{
                  padding: '10px', fontSize: 13, fontWeight: 700,
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
                }}
              >
                {savingPdf ? (
                  <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving PDF...</>
                ) : (
                  <><Download size={15} /> Save as PDF</>
                )}
              </button>

              <button
                type="button"
                onClick={handleSystemPrintDialog}
                disabled={loading}
                style={{
                  background: 'transparent', border: 'none', color: '#64748b',
                  fontSize: 11.5, cursor: 'pointer', padding: '6px', textAlign: 'center',
                  textDecoration: 'underline',
                }}
              >
                Open Windows Print Dialog
              </button>
            </div>
          </div>

          {/* Right Column: Live Visual Preview */}
          <div style={{
            background: '#334155', padding: '24px', overflowY: 'auto',
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
          }}>
            {loading ? (
              <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: 10, marginTop: 40 }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Receipt tayar ki ja rahi hai...</span>
              </div>
            ) : (
              <div style={{
                background: 'white',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                borderRadius: layout === '80mm' ? 6 : 4,
                width: layout === '80mm' ? '320px' : '100%',
                maxWidth: layout === '80mm' ? '320px' : '720px',
                minHeight: '480px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}>
                <iframe
                  ref={iframeRef}
                  srcDoc={htmlContent}
                  title="Receipt Preview"
                  style={{
                    width: '100%',
                    height: layout === '80mm' ? '700px' : '900px',
                    border: 'none',
                    background: 'white',
                    display: 'block',
                  }}
                />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
