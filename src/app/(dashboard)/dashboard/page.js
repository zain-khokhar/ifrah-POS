'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Truck, RotateCcw, AlertTriangle, CreditCard,
  ArrowRight, Plus, Clock, Info,
  Zap, BarChart2, UserPlus, Shirt, BookOpen,
} from 'lucide-react';

const STATUS_CHIP = {
  None:    { bg: '#f1f5f9', color: '#64748b' },
  Open:    { bg: '#dbeafe', color: '#1d4ed8' },
  Pending: { bg: '#fef3c7', color: '#d97706' },
  Closed:  { bg: '#dcfce7', color: '#16a34a' },
};

export default function DashboardPage() {
  const [summary, setSummary]               = useState({ deliveries: 0, returns: 0, overdue: 0, pending: 0 });
  const [recentBookings, setRecentBookings] = useState([]);
  const [scheduleItems, setScheduleItems]   = useState([]);
  const [loading, setLoading]               = useState(true);

  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('ifrah_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [sumRes, bookingsRes] = await Promise.all([
          window.electronAPI?.bookings.todaySummary(),
          window.electronAPI?.bookings.list({ limit: 10 }),
        ]);

        if (sumRes?.ok) {
          setSummary(sumRes.data);
        }

        if (bookingsRes?.ok) {
          const list = bookingsRes.data || [];
          setRecentBookings(list.slice(0, 5));

          const todayIso = new Date().toISOString().slice(0, 10);
          const schedule = [];

          list.forEach(b => {
            if (b.delivery_date === todayIso) {
              schedule.push({
                type: 'delivery',
                time: 'Delivery',
                name: b.customer_name || `Booking #${b.booking_no}`,
                detail: b.dresses_summary || `Booking #${b.booking_no}`,
              });
            }
            if (b.returning_date === todayIso) {
              schedule.push({
                type: 'return',
                time: 'Return',
                name: b.customer_name || `Booking #${b.booking_no}`,
                detail: b.dresses_summary || `Booking #${b.booking_no}`,
              });
            }
          });

          setScheduleItems(schedule);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
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

  const stats = [
    {
      label: 'Aaj ki Deliveries',
      value: summary.deliveries,
      sub: `${summary.deliveries} customer${summary.deliveries !== 1 ? 's' : ''} ko dresses jaayengi`,
      icon: Truck, color: '#3b82f6', bg: '#dbeafe', href: '/deliveries?filter=today',
    },
    {
      label: 'Aaj ke Returns',
      value: summary.returns,
      sub: `${summary.returns} dress${summary.returns !== 1 ? 'es' : ''} wapas aangi aaj`,
      icon: RotateCcw, color: '#10b981', bg: '#dcfce7', href: '/returns?filter=due_today',
    },
    {
      label: 'Overdue Returns',
      value: summary.overdue,
      sub: summary.overdue > 0 ? `${summary.overdue} dress abhi tak wapas nahi` : 'Sab clear hai!',
      icon: AlertTriangle, color: '#ef4444', bg: '#fee2e2', href: '/returns?filter=overdue',
    },
    {
      label: 'Pending Payments',
      value: summary.pending,
      sub: `${summary.pending} booking${summary.pending !== 1 ? 's' : ''} ka baqi raqam`,
      icon: CreditCard, color: '#f59e0b', bg: '#fef9c3', href: '/payments',
    },
  ];

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {greeting()}, {user?.name?.split(' ')[0] || user?.full_name?.split(' ')[0] || 'User'}
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
          {stats.map(s => {
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

            {loading ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Bookings load ho rahi hain...
              </div>
            ) : recentBookings.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: '#f8fafc',
                  border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 12px auto', color: '#94a3b8',
                }}>
                  <BookOpen size={20} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Abhi koi booking nahi hai
                </div>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: '0 auto 14px auto', maxWidth: 300 }}>
                  Aap ki pehli booking yahan display hogi.
                </p>
                <Link href="/bookings/new" className="btn btn-primary btn-sm" style={{ display: 'inline-flex' }}>
                  <Plus size={14} /> Pehli Booking Banayein
                </Link>
              </div>
            ) : (
              <>
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
                    {recentBookings.map(b => {
                      const chip = STATUS_CHIP[b.status] || STATUS_CHIP.None;
                      return (
                        <tr key={b.id}>
                          <td>
                            <span style={{ fontWeight: 700, color: '#7c3aed', fontFamily: 'monospace', fontSize: 13 }}>
                              #{b.booking_no}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{b.customer_name || '—'}</td>
                          <td style={{ color: '#64748b' }}>{b.dresses_summary || '—'}</td>
                          <td>{b.delivery_date || '—'}</td>
                          <td>{b.returning_date || '—'}</td>
                          <td>
                            <span style={{
                              background: chip.bg, color: chip.color,
                              padding: '2px 8px', borderRadius: 20, fontSize: 11.5, fontWeight: 700,
                            }}>
                              {b.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            Rs. {(b.grand_total || 0).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#64748b' }}>
                  <span>{recentBookings.length} recent booking{recentBookings.length !== 1 ? 's' : ''}</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    Total: Rs. {recentBookings.reduce((s, b) => s + (b.grand_total || 0), 0).toLocaleString()}
                  </span>
                </div>
              </>
            )}
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
                {scheduleItems.length === 0 ? (
                  <div style={{ padding: '18px 8px', textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
                    Aaj ke liye koi delivery ya return nahi hai.
                  </div>
                ) : (
                  scheduleItems.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 12,
                      padding: '8px 0',
                      borderBottom: i < scheduleItems.length - 1 ? '1px solid #f1f5f9' : 'none',
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
                  ))
                )}
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
