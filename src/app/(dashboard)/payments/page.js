'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CreditCard, Search, Calendar, RefreshCw, X,
  CheckCircle, AlertCircle, Ban, ArrowRight,
} from 'lucide-react';

const METHOD_BADGES = {
  cash:   { bg: '#dcfce7', color: '#16a34a', label: 'Cash' },
  bank:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Bank' },
  wallet: { bg: '#fef3c7', color: '#d97706', label: 'Wallet' },
  other:  { bg: '#f1f5f9', color: '#64748b', label: 'Other' },
};

function MethodBadge({ method }) {
  const m = METHOD_BADGES[String(method || '').toLowerCase()] || METHOD_BADGES.other;
  return (
    <span style={{
      background: m.bg, color: m.color,
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
    }}>
      {m.label}
    </span>
  );
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [summary,  setSummary]  = useState({ total: 0, cash: 0, bank: 0, wallet: 0, depositTotal: 0 });
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [method,   setMethod]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  async function handleRefresh() {
    setLoading(true);
    try {
      const [listRes, sumRes] = await Promise.all([
        window.electronAPI?.payments.listAll({
          search: search || '',
          method: method || '',
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        }),
        window.electronAPI?.payments.summary({
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        }),
      ]);

      if (listRes?.ok) setPayments(listRes.data || []);
      if (sumRes?.ok)  setSummary(sumRes.data || { total: 0, cash: 0, bank: 0, wallet: 0 });
    } catch (err) {
      console.error('[PaymentsPage]', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      window.electronAPI?.payments.listAll({
        search: search || '',
        method: method || '',
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      }),
      window.electronAPI?.payments.summary({
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      }),
    ]).then(([listRes, sumRes]) => {
      if (active) {
        if (listRes?.ok) setPayments(listRes.data || []);
        if (sumRes?.ok)  setSummary(sumRes.data || { total: 0, cash: 0, bank: 0, wallet: 0 });
        setLoading(false);
      }
    }).catch(err => {
      console.error('[PaymentsPage]', err);
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [search, method, dateFrom, dateTo]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments &amp; Ledger</h1>
          <p className="page-subtitle">
            {loading ? 'Hisab kitab load ho raha hai…' : `${payments.length} transactions record`}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleRefresh}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="page-body">
        {/* ── Summary Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Received (Rental)', value: summary.total, color: '#7c3aed', bg: '#ede9fe' },
            { label: 'Cash Collection',        value: summary.cash,  color: '#10b981', bg: '#dcfce7' },
            { label: 'Bank Transfer',          value: summary.bank,  color: '#3b82f6', bg: '#dbeafe' },
            { label: 'Mobile Wallet',          value: summary.wallet,color: '#f59e0b', bg: '#fef3c7' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>
                Rs. {Number(s.value || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter Bar ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 36 }}
              placeholder="Booking #, customer name, ya phone number se dhoondein..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select
            className="form-input form-select"
            style={{ width: 140 }}
            value={method}
            onChange={e => setMethod(e.target.value)}
          >
            <option value="">Sab Methods</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="wallet">Wallet</option>
            <option value="other">Other</option>
          </select>

          <input
            type="date"
            className="form-input"
            style={{ width: 150 }}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            title="Start date"
          />

          <input
            type="date"
            className="form-input"
            style={{ width: 150 }}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            title="End date"
          />

          {(search || method || dateFrom || dateTo) && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
              onClick={() => { setSearch(''); setMethod(''); setDateFrom(''); setDateTo(''); }}
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* ── Data Table ── */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={26} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
              <div>Payments load ho rahi hain...</div>
            </div>
          ) : payments.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
              <CreditCard size={44} style={{ marginBottom: 12, opacity: 0.35 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                {search || method || dateFrom || dateTo ? 'Koi payment nahi mili' : 'Abhi tak koi payment record nahi hui'}
              </div>
              <div style={{ fontSize: 13 }}>
                Booking create karte waqt Advance add karein ya booking screen se payment darj karein.
              </div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Booking #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Kind</th>
                  <th>Received By</th>
                  <th>Note</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const isVoid = p.is_void === 1;
                  return (
                    <tr key={p.id} style={{ opacity: isVoid ? 0.6 : 1, background: isVoid ? '#fef2f2' : undefined }}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>
                        #{p.id}
                      </td>
                      <td>
                        <Link
                          href={`/bookings/new?id=${p.booking_id}`}
                          style={{ fontWeight: 800, color: '#7c3aed', fontFamily: 'monospace', fontSize: 13, textDecoration: 'none' }}
                        >
                          #{p.booking_no}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.customer_name || '—'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{p.customer_phone || ''}</div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{p.paid_on || '—'}</td>
                      <td><MethodBadge method={p.payment_method} /></td>
                      <td>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: p.kind === 'deposit' ? '#f3e8ff' : '#f1f5f9',
                          color: p.kind === 'deposit' ? '#7e22ce' : '#475569',
                          textTransform: 'uppercase',
                        }}>
                          {p.kind}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5, color: '#64748b' }}>{p.received_by_name || 'Staff'}</td>
                      <td style={{ fontSize: 12, color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.note || '—'}
                      </td>
                      <td style={{
                        textAlign: 'right', fontWeight: 800, fontSize: 13.5,
                        color: isVoid ? '#94a3b8' : '#10b981',
                        textDecoration: isVoid ? 'line-through' : 'none',
                      }}>
                        Rs. {Number(p.amount || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isVoid ? (
                          <span style={{
                            background: '#fee2e2', color: '#b91c1c',
                            padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }} title={p.void_reason || 'Voided'}>
                            <Ban size={10} /> Voided
                          </span>
                        ) : (
                          <span style={{
                            background: '#dcfce7', color: '#16a34a',
                            padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                          }}>
                            <CheckCircle size={10} /> Active
                          </span>
                        )}
                      </td>
                      <td>
                        <Link href={`/bookings/new?id=${p.booking_id}`} className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '3px 8px' }}>
                          View <ArrowRight size={10} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {payments.length > 0 && (
            <div style={{
              padding: '12px 16px', borderTop: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 13, color: '#64748b',
            }}>
              <span>{payments.length} transactions total</span>
              <span style={{ fontWeight: 800, color: '#0f172a' }}>
                Total Active: Rs. {summary.total.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
