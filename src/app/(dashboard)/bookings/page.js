'use client';
import Link from 'next/link';
import { BookOpen, Plus, Search, Filter } from 'lucide-react';

const MOCK_BOOKINGS = [
  { id: 'BK-001', publicId: 'BK-001', customer: 'Ayesha Khan',    contact: '0300-1234567', delivery: '10 Oct 2026', returning: '12 Oct 2026', status: 'pending', payStatus: 'partial', total: 25000, paid: 10000 },
  { id: 'BK-002', publicId: 'BK-002', customer: 'Fatima Ahmed',   contact: '0311-9876543', delivery: '11 Oct 2026', returning: '13 Oct 2026', status: 'open',    payStatus: 'paid',    total: 15000, paid: 15000 },
  { id: 'BK-003', publicId: 'BK-003', customer: 'Sana Malik',     contact: '0333-5551234', delivery: '09 Oct 2026', returning: '10 Oct 2026', status: 'closed',  payStatus: 'paid',    total: 8000,  paid: 8000  },
  { id: 'BK-004', publicId: 'BK-004', customer: 'Zara Hussain',   contact: '0345-1112222', delivery: '12 Oct 2026', returning: '14 Oct 2026', status: 'pending', payStatus: 'unpaid',  total: 18000, paid: 0     },
  { id: 'BK-005', publicId: 'BK-005', customer: 'Hina Baig',      contact: '0321-7778888', delivery: '10 Oct 2026', returning: '11 Oct 2026', status: 'open',    payStatus: 'partial', total: 12000, paid: 5000  },
];

const STATUS_MAP    = { pending: 'badge-warning', open: 'badge-info',    closed: 'badge-gray'    };
const PAY_MAP       = { paid: 'badge-success',    partial: 'badge-warning', unpaid: 'badge-danger' };
const STATUS_LABELS = { pending: 'Pending', open: 'Open', closed: 'Closed' };
const PAY_LABELS    = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' };

export default function BookingsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Bookings</h1>
          <p className="page-subtitle">Sab bookings dekhein, edit karein ya naye banayein</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/bookings/new" className="btn btn-primary">
            <Plus size={15} /> New Booking
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* Search & Filter Bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Customer name, Booking ID ya dress se search karein..." />
          </div>
          <select className="form-input form-select" style={{ width: 140 }}>
            <option value="">Sab Status</option>
            <option>Pending</option>
            <option>Open</option>
            <option>Closed</option>
          </select>
          <select className="form-input form-select" style={{ width: 140 }}>
            <option value="">Sab Payment</option>
            <option>Paid</option>
            <option>Partial</option>
            <option>Unpaid</option>
          </select>
          <button className="btn btn-secondary">
            <Filter size={14} /> Filter
          </button>
        </div>

        {/* Table */}
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Customer</th>
                <th>Contact</th>
                <th>Delivery</th>
                <th>Return</th>
                <th>Booking Status</th>
                <th>Payment</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Remaining</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_BOOKINGS.map(b => (
                <tr key={b.id}>
                  <td><span style={{ fontWeight: 700, color: '#7c3aed', fontFamily: 'monospace', fontSize: 13 }}>{b.publicId}</span></td>
                  <td style={{ fontWeight: 600 }}>{b.customer}</td>
                  <td style={{ color: '#64748b', fontSize: 12.5 }}>{b.contact}</td>
                  <td style={{ fontSize: 12.5 }}>{b.delivery}</td>
                  <td style={{ fontSize: 12.5 }}>{b.returning}</td>
                  <td><span className={`badge ${STATUS_MAP[b.status]}`}>{STATUS_LABELS[b.status]}</span></td>
                  <td><span className={`badge ${PAY_MAP[b.payStatus]}`}>{PAY_LABELS[b.payStatus]}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>Rs. {b.total.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: b.total - b.paid > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                    Rs. {(b.total - b.paid).toLocaleString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-secondary btn-sm">View</button>
                      <button className="btn btn-secondary btn-sm">Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#64748b', alignItems: 'center' }}>
            <span>5 bookings • Mock data (Phase 5 mein real data aayega)</span>
            <div style={{ display: 'flex', gap: 24, fontWeight: 700, color: '#0f172a' }}>
              <span>Total: Rs. {MOCK_BOOKINGS.reduce((s,b) => s+b.total, 0).toLocaleString()}</span>
              <span style={{ color: '#ef4444' }}>Remaining: Rs. {MOCK_BOOKINGS.reduce((s,b) => s+(b.total-b.paid), 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
