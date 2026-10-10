'use client';
import { BarChart2, Users, Shirt, CreditCard, Truck, AlertTriangle, FileText, Download, FileBarChart } from 'lucide-react';

const REPORTS = [
  {
    icon: Users, label: 'Customer Report',
    desc: 'Booking ID, dates, customer info, totals, balance',
    phase: 'Phase 9', color: '#3b82f6', bg: '#dbeafe',
  },
  {
    icon: Users, label: 'Only Customer Report',
    desc: 'City, month, rental days, customer names',
    phase: 'Phase 9', color: '#8b5cf6', bg: '#ede9fe',
  },
  {
    icon: Shirt, label: 'Dress Report',
    desc: 'Booking, customer, dress, accessories, dates',
    phase: 'Phase 9', color: '#ec4899', bg: '#fce7f3',
  },
  {
    icon: Truck, label: "Today's Dresses Report",
    desc: 'Aaj deliver hone wali dresses ki list',
    phase: 'Phase 8', color: '#10b981', bg: '#dcfce7',
  },
  {
    icon: FileText, label: 'Next Two Days Report',
    desc: 'Agle 2 din ki deliveries aur returns',
    phase: 'Phase 8', color: '#f59e0b', bg: '#fef9c3',
  },
  {
    icon: CreditCard, label: 'Daily Cash Report',
    desc: 'Har din ki payments — cash, bank, wallet',
    phase: 'Phase 9', color: '#06b6d4', bg: '#cffafe',
  },
  {
    icon: AlertTriangle, label: 'Outstanding Balance',
    desc: 'Jin bookings ka baki paisah hai',
    phase: 'Phase 9', color: '#f59e0b', bg: '#fef9c3',
  },
  {
    icon: AlertTriangle, label: 'Overdue Return Report',
    desc: 'Dresses jo waqt par wapas nahi aayi',
    phase: 'Phase 9', color: '#ef4444', bg: '#fee2e2',
  },
];

export default function ReportsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Business reports — screen, print, PDF aur Excel</p>
        </div>
      </div>

      <div className="page-body">
        <div style={{
          padding: '14px 18px', marginBottom: 20,
          background: 'linear-gradient(135deg, #ede9fe, #fdf4ff)',
          borderRadius: 10, border: '1px solid #ddd6fe',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>
            <FileBarChart size={16} /> Reports Roadmap (Phase 9)
          </div>
          <div style={{ fontSize: 12.5, color: '#6d28d9', marginTop: 4 }}>
            Sabhi reports Phase 9 mein implement honge. Niche diye gaye reports available honge — date filter, city filter, export (PDF, Excel, CSV) ke saath.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {REPORTS.map(r => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="card" style={{ opacity: 0.75 }}>
                <div style={{ padding: '18px 18px 14px' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: r.bg, color: r.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 12,
                  }}>
                    <Icon size={18} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>{r.desc}</div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="coming-soon-badge">{r.phase}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-icon" title="PDF" disabled><Download size={12} /></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
