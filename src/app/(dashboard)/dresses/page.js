'use client';
import { Plus, Search, Shirt } from 'lucide-react';

const MOCK_DRESSES = [
  { code: 'DR-001', name: 'Red Bridal Lehenga',   category: 'Lehenga', size: 'Medium', rate: 25000, active: true,  bookings: 5 },
  { code: 'DR-002', name: 'Blue Gharara',          category: 'Gharara', size: 'Large',  rate: 15000, active: true,  bookings: 3 },
  { code: 'DR-003', name: 'Green Saree',           category: 'Saree',   size: 'Free',   rate: 8000,  active: true,  bookings: 7 },
  { code: 'DR-004', name: 'Pink Lehenga',          category: 'Lehenga', size: 'Small',  rate: 18000, active: true,  bookings: 2 },
  { code: 'DR-005', name: 'Maroon Sharara',        category: 'Sharara', size: 'Medium', rate: 12000, active: true,  bookings: 4 },
  { code: 'DR-006', name: 'Gold Anarkali Suit',    category: 'Suit',    size: 'Medium', rate: 10000, active: false, bookings: 1 },
];

export default function DressesPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dress Catalogue</h1>
          <p className="page-subtitle">Tamam dresses ka record — code, size, rate aur availability</p>
        </div>
        <button className="btn btn-primary"><Plus size={15} /> Add Dress</button>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Dress name, code ya category se search karein..." />
          </div>
          <select className="form-input form-select" style={{ width: 140 }}>
            <option>Sab Categories</option>
            <option>Lehenga</option><option>Gharara</option><option>Saree</option>
            <option>Sharara</option><option>Suit</option>
          </select>
          <select className="form-input form-select" style={{ width: 120 }}>
            <option>Active &amp; Inactive</option>
            <option>Sirf Active</option>
            <option>Sirf Inactive</option>
          </select>
        </div>

        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Dress Name</th>
                <th>Category</th>
                <th>Size</th>
                <th style={{ textAlign: 'right' }}>Rental Rate</th>
                <th style={{ textAlign: 'center' }}>Bookings</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_DRESSES.map(d => (
                <tr key={d.code}>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700, color: '#7c3aed' }}>{d.code}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td><span className="badge badge-gray">{d.category}</span></td>
                  <td>{d.size}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>Rs. {d.rate.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="badge badge-info">{d.bookings}</span>
                  </td>
                  <td>
                    <span className={`badge ${d.active ? 'badge-success' : 'badge-danger'}`}>
                      {d.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-secondary btn-sm">Edit</button>
                      <button className="btn btn-secondary btn-sm" style={{ color: d.active ? '#ef4444' : '#10b981' }}>
                        {d.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
            {MOCK_DRESSES.filter(d => d.active).length} active, {MOCK_DRESSES.filter(d => !d.active).length} inactive • Phase 4 mein full dress management aayega
          </div>
        </div>
      </div>
    </div>
  );
}
