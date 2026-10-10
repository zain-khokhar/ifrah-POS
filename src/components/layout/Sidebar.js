'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, Users, Shirt,
  CreditCard, Truck, RotateCcw, BarChart2,
  UserCog, Settings, Database, Plus, LogOut,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const mainNav = [
  { label: 'Dashboard',  href: '/dashboard',  icon: LayoutDashboard },
  { label: 'Bookings',   href: '/bookings',   icon: BookOpen        },
  { label: 'Customers',  href: '/customers',  icon: Users           },
  { label: 'Dresses',    href: '/dresses',    icon: Shirt           },
  { label: 'Payments',   href: '/payments',   icon: CreditCard      },
  { label: 'Deliveries', href: '/deliveries', icon: Truck           },
  { label: 'Returns',    href: '/returns',    icon: RotateCcw       },
  { label: 'Reports',    href: '/reports',    icon: BarChart2       },
];

const adminNav = [
  { label: 'Users',         href: '/users',    icon: UserCog  },
  { label: 'Settings',      href: '/settings', icon: Settings },
  { label: 'Backup & Sync', href: '/backup',   icon: Database },
];

const roleColors = {
  owner:   { bg: '#ede9fe', color: '#5b21b6', label: 'Owner'   },
  cashier: { bg: '#dbeafe', color: '#1e40af', label: 'Cashier' },
  viewer:  { bg: '#f1f5f9', color: '#475569', label: 'Viewer'  },
};

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('ifrah_user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const isActive = (href) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const handleLogout = () => {
    localStorage.removeItem('ifrah_user');
    router.push('/login');
  };

  const roleStyle = roleColors[user?.role] || roleColors.viewer;

  return (
    <div className="sidebar">

      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
          }}>
            👗
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.2px' }}>
              Ifrah Collection
            </div>
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', textTransform: 'uppercase', marginTop: 1 }}>
              POS System
            </div>
          </div>
        </div>
      </div>

      {/* ── New Booking CTA ───────────────────────────────────────── */}
      <div style={{ padding: '10px 10px 2px' }}>
        <Link href="/bookings/new" className={`nav-item highlight ${pathname === '/bookings/new' ? 'active' : ''}`}>
          <Plus size={14} />
          New Booking
        </Link>
      </div>

      {/* ── Main Nav ─────────────────────────────────────────────── */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Main Menu</div>
        {mainNav.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item ${isActive(href) && pathname !== '/bookings/new' ? 'active' : ''}`}
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}

        <div className="nav-section-label" style={{ marginTop: 6 }}>Administration</div>
        {adminNav.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} className={`nav-item ${isActive(href) ? 'active' : ''}`}>
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </nav>

      {/* ── User Footer ───────────────────────────────────────────── */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {user?.name?.[0] || 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name">{user?.name || 'User'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700,
                padding: '1px 6px', borderRadius: 100,
                background: roleStyle.bg,
                color: roleStyle.color,
                letterSpacing: '0.3px',
              }}>
                {roleStyle.label}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.25)', padding: 4,
              display: 'flex', alignItems: 'center',
              borderRadius: 6, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
