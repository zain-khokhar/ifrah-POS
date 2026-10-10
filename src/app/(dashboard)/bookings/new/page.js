'use client';
import { Plus, BookOpen, ArrowLeft, Calendar, User, Shirt, CreditCard, Save, Printer, Layers } from 'lucide-react';
import Link from 'next/link';

export default function NewBookingPage() {
  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/bookings" className="btn-icon">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <h1 className="page-title">New Booking</h1>
            <p className="page-subtitle">Naya dress rental booking banayein</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary"><Save size={14} /> Save</button>
          <button className="btn btn-primary"><Printer size={14} /> Save &amp; Print</button>
        </div>
      </div>

      <div className="page-body">
        {/* Phase notice */}
        <div style={{
          padding: '14px 18px', marginBottom: 20,
          background: 'linear-gradient(135deg, #ede9fe, #fdf4ff)',
          borderRadius: 10, border: '1px solid #ddd6fe',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Layers size={22} color="#7c3aed" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>Phase 5 — Core Booking System</div>
            <div style={{ fontSize: 12.5, color: '#6d28d9', marginTop: 2 }}>
              Full booking form Phase 5 mein implement hoga. Abhi form ka layout preview dikha raha hai.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Section 1: Booking Info */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title"><Calendar size={14} style={{display:'inline',marginRight:6,verticalAlign:'middle'}} />1. Booking Information</h2>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Booking ID</label>
                  <input className="form-input" value="BK-006" readOnly style={{ background: '#f8fafc', color: '#94a3b8' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <select className="form-input form-select"><option>Lahore</option><option>Karachi</option></select>
                </div>
                <div className="form-group">
                  <label className="form-label">Booking Date</label>
                  <input type="date" className="form-input" defaultValue="2026-10-09" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-input form-select"><option>Pending</option><option>Open</option></select>
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery Date</label>
                  <input type="date" className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Returning Date</label>
                  <input type="date" className="form-input" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Month (Auto)</label>
                  <input className="form-input" value="October" readOnly style={{ background: '#f8fafc', color: '#94a3b8' }} />
                </div>
                <div className="form-group" style={{marginBottom:0}}>
                  <label className="form-label">Total Days (Auto)</label>
                  <input className="form-input" value="—" readOnly style={{ background: '#f8fafc', color: '#94a3b8' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Customer Info */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title"><User size={14} style={{display:'inline',marginRight:6,verticalAlign:'middle'}} />2. Customer Information</h2>
              <button className="btn btn-secondary btn-sm"><Plus size={12} /> New Customer</button>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Customer Search</label>
                <input className="form-input" placeholder="Name, CNIC ya contact number se search karein..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Customer Name</label>
                  <input className="form-input" placeholder="Poora naam" />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Number</label>
                  <input className="form-input" placeholder="0300-0000000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer CNIC</label>
                  <input className="form-input" placeholder="35202-0000000-0" />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <select className="form-input form-select"><option>Lahore</option></select>
                </div>
                <div className="form-group">
                  <label className="form-label">Relation Name</label>
                  <input className="form-input" placeholder="Husband/Father ka naam" />
                </div>
                <div className="form-group">
                  <label className="form-label">Relation Type</label>
                  <select className="form-input form-select">
                    <option>Husband</option><option>Father</option><option>Brother</option><option>Other</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Dresses */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h2 className="card-title"><Shirt size={14} style={{display:'inline',marginRight:6,verticalAlign:'middle'}} />3. Dresses</h2>
            <button className="btn btn-secondary btn-sm"><Plus size={12} /> Add Dress</button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:'30%'}}>Dress</th>
                <th>Size</th>
                <th>Qty</th>
                <th>Rate (Rs.)</th>
                <th>Total (Rs.)</th>
                <th>Jewellery</th>
                <th>Clutch</th>
                <th>Shoes</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={10}>
                  <div className="empty-state" style={{ padding: '28px' }}>
                    <div className="empty-state-icon"><Shirt size={24} /></div>
                    <h3 style={{ fontSize: 14 }}>Koi dress add nahi hui</h3>
                    <p style={{ fontSize: 12.5 }}>Upar &quot;Add Dress&quot; click kar ke dress catalogue se dress select karein</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section 4: Payment & Summary */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h2 className="card-title"><CreditCard size={14} style={{display:'inline',marginRight:6,verticalAlign:'middle'}} />4. Payment & Summary</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13.5 }}>
                  <span style={{ color: '#64748b' }}>Grand Total</span>
                  <span style={{ fontWeight: 700 }}>Rs. 0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13.5 }}>
                  <span style={{ color: '#64748b' }}>Total Paid</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>Rs. 0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 15 }}>
                  <span style={{ fontWeight: 700 }}>Remaining</span>
                  <span style={{ fontWeight: 800, color: '#ef4444' }}>Rs. 0</span>
                </div>
              </div>
              <div>
                <div className="form-group">
                  <label className="form-label">Payment Amount (Rs.)</label>
                  <input className="form-input" type="number" placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-input form-select"><option>Cash</option><option>Bank</option><option>Wallet</option></select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
