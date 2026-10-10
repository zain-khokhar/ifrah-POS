'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Truck, RotateCcw, AlertTriangle, CreditCard,
  ArrowRight, Plus, Clock, TrendingUp,
  Zap, BarChart2, UserPlus, Shirt, Info,
} from 'lucide-react';

// ─── Mock data — Phase 0 ────────────────────────────────────────
const MOCK_STATS = [
  {
    label: 'Aaj ki Deliveries',
    value: 3,
    sub: '3 customers ko dresses jaayengi',
    icon: Truck, color: '#3b82f6', bg: '#dbeafe',
    href: '/deliveries',
  },
  {
    label: 'Aaj ke Returns',
    value: 2,
    sub: '2 dresses wapas aangi aaj',
    icon: RotateCcw, color: '#10b981', bg: '#dcfce7',
    href: '/returns',
  },
  {
    label: 'Overdue Returns',
    value: 1,
    sub: '1 dress abhi tak wapas nahi',
    icon: AlertTriangle, color: '#ef4444', bg: '#fee2e2',
    href: '/returns',
  },
  {
    label: 'Unpaid Balance',
    value: 'Rs. 45,000',
    sub: '8 bookings ka baqi raqam',
    icon: CreditCard, color: '#f59e0b', bg: '#fef9c3',
    href: '/payments',
  },
];

const MOCK_BOOKINGS = [
  { id: 'BK-001', customer: 'Ayesha Khan',    dress: 'Red Bridal Lehenga', delivery: '10 Oct', returning: '12 Oct', status: 'pending', amount: 25000 },
  { id: 'BK-002', customer: 'Fatima Ahmed',   dress: 'Blue Gharara',       delivery: '11 Oct', returning: '13 Oct', status: 'open',    amount: 15000 },
  { id: 'BK-003', customer: 'Sana Malik',     dress: 'Green Saree',        delivery: '09 Oct', returning: '10 Oct', status: 'closed',  amount: 8000  },
  { id: 'BK-004', customer: 'Zara Hussain',   dress: 'Pink Lehnga',        delivery: '12 Oct', returning: '14 Oct', status: 'pending', amount: 18000 },
  { id: 'BK-005', customer: 'Hina Baig',      dress: 'Maroon Sharara',     delivery: '10 Oct', returning: '11 Oct', status: 'open',    amount: 12000 },
];

const MOCK_SCHEDULE = [
  { time: '10:00 AM', name: 'Ayesha Khan',  detail: 'Delivery — Red Bridal Lehenga', type: 'delivery' },
  { time: '12:30 PM', name: 'Fatima Ahmed', detail: 'Return — Blue Gharara',          type: 'return'   },
  { time: '03:00 PM', name: 'Sana Malik',   detail: 'Delivery — Green Saree',         type: 'delivery' },
];

const STATUS_MAP = {
  pending: { cls: 'badge-warning', label: 'Pending' },
  open:    { cls: 'badge-info',    label: 'Open'    },
  closed:  { cls: 'badge-gray',    label: 'Closed'  },
};
// ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [user, setUser]               = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const stored = localStorage.getItem('ifrah_user');
    if (stored) setUser(JSON.parse(stored));

    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const greeting = () => {
    const h = currentTime.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const todayStr = currentTime.toLocaleDateString('en-PK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const timeStr = currentTime.toLocaleTimeString('en-PK', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {greeting()}, {user?.name?.split(' ')[0] || 'User'}
          </h1>
          <p className="page-subtitle">{todayStr} • {timeStr}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="sync-status sync-offline">
            <span className="pulse-dot" style={{ background: '#f59e0b', animation: 'pulse-amber 2s infinite' }} />
            Offline Mode
          </div>
          <Link href="/bookings/new" className="btn btn-primary">
            <Plus size={15} />
            New Booking
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* ── Stat Cards ──────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {MOCK_STATS.map(s => {
            const Icon = s.icon;
            return (
              <Link key={s.label} href={s.href} className="stat-card" style={{ color: 'inherit' }}>
                <div className="stat-card-icon" style={{ background: s.bg, color: s.color }}>
                  <Icon size={20} />
                </div>
                <div className="stat-card-label">{s.label}</div>
                <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-card-sub">{s.sub}</div>
              </Link>
            );
          })}
        </div>

        {/* ── Main Content Grid ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

          {/* Recent Bookings Table */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Recent Bookings</h2>
              <Link href="/bookings" className="btn btn-secondary btn-sm">
                Sab Dekhen <ArrowRight size={12} />
              </Link>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Customer</th>
                  <th>Dress</th>
                  <th>Delivery</th>
                  <th>Return</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_BOOKINGS.map(b => {
                  const { cls, label } = STATUS_MAP[b.status];
                  return (
                    <tr key={b.id}>
                      <td>
                        <span style={{ fontWeight: 700, color: '#7c3aed', fontFamily: 'monospace', fontSize: 13 }}>
                          {b.id}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{b.customer}</td>
                      <td style={{ color: '#64748b' }}>{b.dress}</td>
                      <td>{b.delivery}</td>
                      <td>{b.returning}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        Rs. {b.amount.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#64748b' }}>
              <span>5 recent bookings dikha rahe hain</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>
                Total: Rs. {MOCK_BOOKINGS.reduce((s, b) => s + b.amount, 0).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Today's Schedule */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title" style={{ fontSize: 13.5 }}>
                  <Clock size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  Aaj ka Schedule
                </h2>
              </div>
              <div style={{ padding: '10px 14px' }}>
                {MOCK_SCHEDULE.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12,
                    padding: '8px 0',
                    borderBottom: i < MOCK_SCHEDULE.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    <div style={{
                      width: 3, borderRadius: 3, flexShrink: 0,
                      background: item.type === 'delivery' ? '#3b82f6' : '#10b981',
                      alignSelf: 'stretch',
                      minHeight: 36,
                    }} />
                    <div>
                      <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 2 }}>{item.time}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{item.name}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title" style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={14} color="#f59e0b" />
                  Quick Actions
                </h2>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: 'New Booking',  href: '/bookings/new', primary: true,  icon: Plus },
                  { label: 'Add Customer', href: '/customers',    primary: false, icon: UserPlus },
                  { label: 'Add Dress',    href: '/dresses',      primary: false, icon: Shirt },
                  { label: 'Reports',     href: '/reports',      primary: false, icon: BarChart2 },
                  { label: 'Deliveries',  href: '/deliveries',   primary: false, icon: Truck },
                ].map(a => {
                  const Icon = a.icon;
                  return (
                    <Link key={a.label} href={a.href} className={`btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ justifyContent: 'center', width: '100%', gap: 6 }}>
                      <Icon size={14} />
                      {a.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* System Status */}
            <div style={{
              padding: '12px 14px',
              background: 'linear-gradient(135deg, #ede9fe, #fdf4ff)',
              borderRadius: 10,
              border: '1px solid #ddd6fe',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
                <Info size={13} /> Offline-First POS
              </div>
              <div style={{ fontSize: 11.5, color: '#6d28d9', lineHeight: 1.5 }}>
                Local SQLite database engine ready. Sab records shop computer par mehfooz rahenge.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
