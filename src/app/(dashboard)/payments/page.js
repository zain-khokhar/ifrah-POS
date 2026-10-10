'use client';
import { CreditCard, Search, Calendar } from 'lucide-react';

const MOCK_PAYMENTS = [
  { id: 'PAY-001', booking: 'BK-001', customer: 'Ayesha Khan',  date: '05 Oct 2026', amount: 10000, method: 'Cash',  by: 'Owner',  note: 'Advance' },
  { id: 'PAY-002', booking: 'BK-002', customer: 'Fatima Ahmed', date: '06 Oct 2026', amount: 15000, method: 'Bank',  by: 'Cashier', note: 'Full payment' },
  { id: 'PAY-003', booking: 'BK-003', customer: 'Sana Malik',   date: '07 Oct 2026', amount: 8000,  method: 'Cash',  by: 'Owner',  note: '' },
  { id: 'PAY-004', booking: 'BK-005', customer: 'Hina Baig',    date: '08 Oct 2026', amount: 5000,  method: 'Wallet',by: 'Cashier', note: 'Partial' },
];

const METHOD_BADGE = { Cash: 'badge-success', Bank: 'badge-info', Wallet: 'badge-purple' };

export default function PaymentsPage() {
  const total = MOCK_PAYMENTS.reduce((s, p) => s + p.amount, 0);
  const cash   = MOCK_PAYMENTS.filter(p => p.method === 'Cash').reduce((s, p) => s + p.amount, 0);
  const bank   = MOCK_PAYMENTS.filter(p => p.method === 'Bank').reduce((s, p) => s + p.amount, 0);
  const wallet = MOCK_PAYMENTS.filter(p => p.method === 'Wallet').reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Tamam payments ka record — cash, bank aur wallet</p>
        </div>
      </div>

      <div className="page-body">
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Received', value: total, color: '#7c3aed', bg: '#ede9fe' },
            { label: 'Cash',           value: cash,  color: '#10b981', bg: '#dcfce7' },
            { label: 'Bank',           value: bank,  color: '#3b82f6', bg: '#dbeafe' },
            { label: 'Wallet',         value: wallet,color: '#f59e0b', bg: '#fef9c3' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>Rs. {s.value.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Booking ID ya customer name se search karein..." />
          </div>
          <select className="form-input form-select" style={{ width: 130 }}>
            <option>Sab Methods</option><option>Cash</option><option>Bank</option><option>Wallet</option>
          </select>
          <input type="date" className="form-input" style={{ width: 160 }} />
        </div>

        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Booking</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Method</th>
                <th>Received By</th>
                <th>Note</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PAYMENTS.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{p.id}</td>
                  <td><span style={{ fontWeight: 700, color: '#7c3aed', fontSize: 13 }}>{p.booking}</span></td>
                  <td style={{ fontWeight: 600 }}>{p.customer}</td>
                  <td style={{ fontSize: 12.5 }}>{p.date}</td>
                  <td><span className={`badge ${METHOD_BADGE[p.method]}`}>{p.method}</span></td>
                  <td style={{ fontSize: 12.5, color: '#64748b' }}>{p.by}</td>
                  <td style={{ fontSize: 12.5, color: '#94a3b8', fontStyle: p.note ? 'normal' : 'italic' }}>{p.note || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                    Rs. {p.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
            Phase 7 mein full payment management aayega
          </div>
        </div>
      </div>
    </div>
  );
}
