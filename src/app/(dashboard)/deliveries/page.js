'use client';
import { Truck, CheckCircle2 } from 'lucide-react';

const MOCK_DELIVERIES = [
  { id: 'BK-001', customer: 'Ayesha Khan',  contact: '0300-1234567', dress: 'Red Bridal Lehenga', date: '10 Oct 2026', status: 'pending'   },
  { id: 'BK-002', customer: 'Fatima Ahmed', contact: '0311-9876543', dress: 'Blue Gharara',       date: '11 Oct 2026', status: 'pending'   },
  { id: 'BK-004', customer: 'Zara Hussain', contact: '0345-1112222', dress: 'Pink Lehnga',        date: '12 Oct 2026', status: 'pending'   },
  { id: 'BK-005', customer: 'Hina Baig',    contact: '0321-7778888', dress: 'Maroon Sharara',     date: '10 Oct 2026', status: 'delivered' },
];

export default function DeliveriesPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Deliveries</h1>
          <p className="page-subtitle">Kaunsi dresses customer ko deni hain</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge badge-warning" style={{ padding: '6px 12px', fontSize: 12.5 }}>
            3 Pending
          </span>
          <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: 12.5 }}>
            1 Delivered
          </span>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Aaj ki Deliveries — 10 October 2026</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Customer</th>
                <th>Contact</th>
                <th>Dress</th>
                <th>Delivery Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_DELIVERIES.map(d => (
                <tr key={d.id}>
                  <td><span style={{ fontWeight: 700, color: '#7c3aed', fontSize: 13 }}>{d.id}</span></td>
                  <td style={{ fontWeight: 600 }}>{d.customer}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{d.contact}</td>
                  <td>{d.dress}</td>
                  <td>{d.date}</td>
                  <td>
                    <span className={`badge ${d.status === 'delivered' ? 'badge-success' : 'badge-warning'}`}>
                      {d.status === 'delivered' ? 'Delivered' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    {d.status === 'pending' ? (
                      <button className="btn btn-secondary btn-sm" style={{ color: '#10b981', borderColor: '#a7f3d0' }}>
                        <CheckCircle2 size={13} /> Mark Delivered
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
          Phase 8 mein full delivery management aayega
        </div>
      </div>
    </div>
  );
}
