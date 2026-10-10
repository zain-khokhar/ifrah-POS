'use client';
import { RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';

const MOCK_RETURNS = [
  { id: 'BK-003', customer: 'Sana Malik',   contact: '0333-5551234', dress: 'Green Saree',   returnDate: '10 Oct 2026', status: 'returned', daysOverdue: 0 },
  { id: 'BK-005', customer: 'Hina Baig',    contact: '0321-7778888', dress: 'Maroon Sharara',returnDate: '11 Oct 2026', status: 'pending',  daysOverdue: 0 },
  { id: 'BK-007', customer: 'Nadia Shah',   contact: '0300-9990000', dress: 'Gold Anarkali', returnDate: '07 Oct 2026', status: 'overdue',  daysOverdue: 2 },
];

export default function ReturnsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Returns</h1>
          <p className="page-subtitle">Dress return status track karein</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge badge-danger" style={{ padding: '6px 12px', fontSize: 12.5 }}>
            <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            1 Overdue
          </span>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Customer</th>
                <th>Contact</th>
                <th>Dress</th>
                <th>Expected Return</th>
                <th>Status</th>
                <th>Overdue</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_RETURNS.map(r => (
                <tr key={r.id} style={{ background: r.status === 'overdue' ? '#fff5f5' : undefined }}>
                  <td><span style={{ fontWeight: 700, color: '#7c3aed', fontSize: 13 }}>{r.id}</span></td>
                  <td style={{ fontWeight: 600 }}>{r.customer}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{r.contact}</td>
                  <td>{r.dress}</td>
                  <td>{r.returnDate}</td>
                  <td>
                    <span className={`badge ${r.status === 'returned' ? 'badge-success' : r.status === 'overdue' ? 'badge-danger' : 'badge-warning'}`}>
                      {r.status === 'returned' ? 'Returned' : r.status === 'overdue' ? 'Overdue' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ color: r.daysOverdue > 0 ? '#ef4444' : '#94a3b8', fontWeight: r.daysOverdue > 0 ? 700 : 400 }}>
                    {r.daysOverdue > 0 ? `${r.daysOverdue} din` : '—'}
                  </td>
                  <td>
                    {r.status === 'pending' || r.status === 'overdue' ? (
                      <button className="btn btn-secondary btn-sm" style={{ color: '#10b981', borderColor: '#a7f3d0' }}>
                        <CheckCircle2 size={13} /> Mark Returned
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>✓ Done</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
          Phase 8 mein full return management aayega
        </div>
      </div>
    </div>
  );
}
