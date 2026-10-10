'use client';
import { Plus, Search, Users } from 'lucide-react';

const MOCK_CUSTOMERS = [
  { id: 1, name: 'Ayesha Khan',  relation: 'Muhammad Ali',  type: 'Husband', contact: '0300-1234567', cnic: '35202-1234567-8', city: 'Lahore',  cast: 'Rajput',  bookings: 3 },
  { id: 2, name: 'Fatima Ahmed', relation: 'Ahmed Siddiqui',type: 'Father',  contact: '0311-9876543', cnic: '35202-9876543-2', city: 'Lahore',  cast: 'Siddiqui',bookings: 1 },
  { id: 3, name: 'Sana Malik',   relation: 'Tariq Malik',   type: 'Husband', contact: '0333-5551234', cnic: '35202-5551234-5', city: 'Gujranwala',cast:'Malik',  bookings: 2 },
  { id: 4, name: 'Zara Hussain', relation: 'Bilal Hussain', type: 'Brother', contact: '0345-1112222', cnic: '35202-1112222-1', city: 'Lahore',  cast: 'Hussain', bookings: 1 },
  { id: 5, name: 'Hina Baig',    relation: 'Kamran Baig',   type: 'Husband', contact: '0321-7778888', cnic: '35202-7778888-9', city: 'Faisalabad',cast:'Baig',  bookings: 4 },
];

export default function CustomersPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Customer records dekhein aur manage karein</p>
        </div>
        <button className="btn btn-primary"><Plus size={15} /> Add Customer</button>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Name, CNIC, contact ya city se search karein..." />
          </div>
          <select className="form-input form-select" style={{ width: 130 }}>
            <option>Sab Cities</option><option>Lahore</option><option>Karachi</option>
          </select>
          <select className="form-input form-select" style={{ width: 130 }}>
            <option>Sab Cast</option><option>Rajput</option><option>Malik</option>
          </select>
        </div>

        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Customer Name</th>
                <th>Relation / Type</th>
                <th>Contact</th>
                <th>CNIC</th>
                <th>City</th>
                <th>Cast</th>
                <th style={{ textAlign: 'center' }}>Bookings</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_CUSTOMERS.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{c.name}</td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{c.relation}</span>
                    <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>{c.type}</span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{c.contact}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{c.cnic}</td>
                  <td>{c.city}</td>
                  <td>{c.cast}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="badge badge-purple">{c.bookings}</span>
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
          <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8' }}>
            5 customers • Phase 3 mein full customer management aayega
          </div>
        </div>
      </div>
    </div>
  );
}
